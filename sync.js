
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: sync.js
 * VERSION: 7.8.4.2-B
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.2-B",
    CATALOG_REVISION: "751",
    AUTOSAVE_MS: 5000,
    STATUS_REFRESH_MS: 15000
  });

  const running = new Map();
  const blocked = new Map();
  const controllers = new Map();

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function assert(condition, code, message) {
    if (!condition) throw fail(code, message);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function keyOf(context) {
    return PGDDraft.makeKey(context);
  }

  function editable(status) {
    return ["DRAFT", "REJECTED"].includes(status);
  }

  function assertSession(context) {

    const profile = PGDAPI.getProfile();

    assert(
      profile &&
      profile.code === context.employee &&
      profile.branch === context.branch,
      "LOGIN_REQUIRED",
      "Đăng nhập đúng tài khoản để đồng bộ."
    );

  }

  function canonical(value) {

    if (Array.isArray(value)) {
      return "[" +
        value.map(canonical).join(",") + "]";
    }

    if (value && typeof value === "object") {
      return "{" +
        Object.keys(value).sort().map(key =>
          JSON.stringify(key) + ":" +
          canonical(value[key])
        ).join(",") + "}";
    }

    return JSON.stringify(value);

  }

  function equal(a, b) {
    return canonical(a) === canonical(b);
  }

  function emptyFields() {
    return {
      inventory: {},
      supplies: {},
      checklist: {},
      wasteNote: "",
      generalNote: ""
    };
  }

  function cleanFields(fields, context) {

    const data = Object.assign(
      emptyFields(),
      clone(fields || {})
    );

    if (context.department === "TRUONG_CA") {

      [
        "CL033", "CL034", "CL035",
        "CL036", "CL047"
      ].forEach(id => {
        delete data.checklist[id];
      });

    }

    return data;

  }

  function wasteSignature(fields) {

    return JSON.stringify(
      Object.keys(fields.inventory || {})
        .filter(id =>
          Number(fields.inventory[id].waste) > 0
        )
        .sort()
        .map(id => [
          id,
          Number(fields.inventory[id].waste)
        ])
    );

  }

  function requireModules() {

    assert(
      global.PGDAPI &&
      global.PGDDraft &&
      global.PGDOutbox,
      "MODULE_MISSING",
      "Thiếu module API, Draft hoặc Outbox."
    );

    assert(
      typeof PGDAPI.requestState === "function" &&
      typeof PGDAPI.sendPending === "function",
      "API_UPGRADE_REQUIRED",
      "Cần nâng cấp api.js."
    );

  }

  async function withLock(context, callback) {

    requireModules();

    assert(
      navigator.locks &&
      typeof navigator.locks.request === "function",
      "WEB_LOCKS_UNAVAILABLE",
      "Trình duyệt chưa hỗ trợ khóa đồng bộ."
    );

    return navigator.locks.request(
      "PGD_SYNC_" + keyOf(context),
      {mode: "exclusive"},
      callback
    );

  }

  async function atomicUpdate(context, updater) {

    const db = await PGDDraft.openDatabase();

    return new Promise((resolve, reject) => {

      const tx = db.transaction(
        ["drafts", "draft_backups"],
        "readwrite"
      );

      const store = tx.objectStore("drafts");

      const backups =
        tx.objectStore("draft_backups");

      const request = store.get(keyOf(context));

      let result;
      let failure;

      request.onsuccess = function() {

        try {

          result = updater(
            request.result || null,
            backups
          );

          if (result) store.put(result);

        } catch (error) {

          failure = error;
          tx.abort();

        }

      };

      tx.oncomplete = () => resolve(result);

      tx.onerror = () =>
        reject(failure || tx.error);

      tx.onabort = () =>
        reject(
          failure || tx.error ||
          fail("LOCAL_WRITE_FAILED",
               "Không cập nhật được bản nháp.")
        );

    });

  }

  function backupRecord(store, record, reason) {

    if (!record) return;

    store.put({
      backupId: PGDDraft.createId(),
      draftKey: record.key,
      reason: reason,
      backedUpAt: new Date().toISOString(),
      record: clone(record)
    });

  }

  /* =====================================================
     XÁC MINH NỘI DUNG MÁY CHỦ
  ===================================================== */

  async function verifyContent(context, pending, server) {

    assert(
      server && server.success === true,
      "INVALID_SERVER_DRAFT",
      "Không đọc được bản nháp máy chủ."
    );

    assert(
      server.catalogRevision === "751",
      "CATALOG_MISMATCH",
      "Danh mục không tương thích."
    );

    assert(
      editable(server.status),
      "LOCKED",
      "Bản nháp đã bị khóa."
    );

    const payload = pending.payload;

    if (pending.action === "saveDraft") {

      assert(
        equal(
          cleanFields(server.data, context),
          cleanFields(payload.data, context)
        ),
        "CONTENT_MISMATCH",
        "Nội dung máy chủ khác yêu cầu đã gửi."
      );

    } else if (pending.action === "savePhoto") {

      const id = payload.photoId;

      assert(
        server.photos && server.photos[id],
        "PHOTO_MISSING",
        "Không tìm thấy ảnh trên máy chủ."
      );

      const image = await PGDAPI.readPhoto(
        context, id
      );

      assert(
        image.data === payload.data,
        "PHOTO_CONTENT_MISMATCH",
        "Nội dung ảnh không trùng khớp."
      );

    } else if (pending.action === "removePhoto") {

      assert(
        !(server.photos || {})[payload.photoId],
        "PHOTO_STILL_EXISTS",
        "Liên kết ảnh chưa được xóa."
      );

    } else {

      throw fail(
        "INVALID_ACTION",
        "Thao tác không hợp lệ."
      );

    }

    const latest = await PGDAPI.restoreDraft(context);

    assert(
      latest.version === server.version &&
      latest.status === server.status &&
      equal(latest.data, server.data) &&
      equal(latest.photos, server.photos),
      "VERSION_CONFLICT",
      "Máy chủ thay đổi trong lúc xác minh."
    );

    return latest;

  }

  /* =====================================================
     XÁC NHẬN VÀO INDEXEDDB TRƯỚC KHI XÓA OUTBOX
  ===================================================== */

  async function acknowledge(context, pending, server) {

    const oldVersion = pending.expectedVersion;

    const newVersion = server.version;

    assert(
      newVersion === oldVersion + 1 ||
      (
        pending.action === "removePhoto" &&
        newVersion === oldVersion
      ),
      "INVALID_CONFIRMED_VERSION",
      "Phiên bản xác nhận không hợp lệ."
    );

    await atomicUpdate(context, function(record) {

      assert(
        record,
        "LOCAL_MISSING",
        "Không tìm thấy bản nháp thiết bị."
      );

      assert(
        editable(record.status),
        "LOCKED",
        "Bản nháp thiết bị đã bị khóa."
      );

      assert(
        record.serverVersion === oldVersion ||
        record.serverVersion === newVersion,
        "LOCAL_VERSION_CHANGED",
        "Phiên bản thiết bị đã thay đổi."
      );

      record.serverVersion = newVersion;

      record.photos = record.photos || {};

      if (pending.action === "savePhoto") {

        const id = pending.payload.photoId;

        const photo = record.photos[id];

        if (
          photo &&
          photo.data === pending.payload.data &&
          server.photos &&
          server.photos[id]
        ) {

          photo.fileId =
            server.photos[id].fileId;

          photo.dirty = false;

        }

      }

      // Không đánh dấu toàn bộ bản nháp đã đồng bộ.
      // Có thể còn thay đổi mới hoặc ảnh chưa gửi.

      record.dirty = true;

      return record;

    });

    await PGDOutbox.complete(
      context,
      pending.requestId,
      newVersion
    );

    return server;

  }

  /* =====================================================
     PHÂN LOẠI LỖI
  ===================================================== */

  function isBlockingError(error) {

    return [
      "VERSION_CONFLICT",
      "LOCKED",
      "UNKNOWN",
      "CONTENT_MISMATCH",
      "PHOTO_CONTENT_MISMATCH",
      "PHOTO_MISSING",
      "PHOTO_STILL_EXISTS",
      "LOCAL_VERSION_CHANGED",
      "LOCAL_MISSING",
      "INVALID_CONFIRMED_VERSION",
      "CATALOG_MISMATCH"
    ].includes(error.code);

  }

  async function preserveFailure(
    context, pending, error
  ) {

    const code = error.code || "SYNC_ERROR";

    if (isBlockingError(error)) {

      await PGDOutbox.markBlocked(
        context,
        pending.requestId,
        code
      );

      blocked.set(keyOf(context), {
        code: code
      });

    } else {

      await PGDOutbox.markUncertain(
        context,
        pending.requestId,
        code
      );

    }

  }

  /* =====================================================
     PHỤC HỒI YÊU CẦU ĐANG CHỜ
  ===================================================== */

  async function recoverInternal(context) {

    assertSession(context);

    const pending = await PGDOutbox.get(context);

    if (!pending) {
      return {
        success: true,
        recovered: false
      };
    }

    assert(
      pending.status !== "BLOCKED",
      "OUTBOX_BLOCKED",
      "Yêu cầu đang bị chặn. Không tự ghi đè."
    );

    assert(
      navigator.onLine,
      "OFFLINE",
      "Thiết bị chưa có kết nối mạng."
    );

    try {

      const state = await PGDAPI.requestState(
        context,
        pending.action,
        pending.requestId,
        pending.expectedVersion
      );

      let server;

      if (state.state === "APPLIED") {

        server = state.server;

      } else if (state.state === "RETRY_ALLOWED") {

        await PGDOutbox.markSending(
          context,
          pending.requestId
        );

        // Gửi lại đúng mã, nội dung và version cũ.

        server = await PGDAPI.sendPending(pending);

      } else {

        throw fail(
          state.state,
          "Không thể tự phục hồi yêu cầu."
        );

      }

      server = await verifyContent(
        context, pending, server
      );

      await acknowledge(
        context, pending, server
      );

      blocked.delete(keyOf(context));

      return {
        success: true,
        recovered: true,
        requestId: pending.requestId,
        version: server.version,
        recoveryState: state.state
      };

    } catch (error) {

      await preserveFailure(
        context, pending, error
      );

      throw error;

    }

  }

  function recoverPending(context) {

    return withLock(
      context,
      () => recoverInternal(context)
    );

  }

  /* =====================================================
     GHI YÊU CẦU MỚI
  ===================================================== */

  async function write(
    context,
    action,
    payload,
    version,
    localRevision
  ) {

    const pending = await PGDOutbox.prepare(
      context,
      {
        action: action,
        requestId: PGDDraft.createId(),
        expectedVersion: version,
        localRevision: localRevision,
        payload: payload
      }
    );

    try {

      await PGDOutbox.markSending(
        context,
        pending.requestId
      );

      let server = await PGDAPI.sendPending(
        pending
      );

      server = await verifyContent(
        context, pending, server
      );

      return await acknowledge(
        context, pending, server
      );

    } catch (error) {

      await preserveFailure(
        context, pending, error
      );

      throw error;

    }

  }

  /* =====================================================
     ĐỒNG BỘ TOÀN BỘ BẢN NHÁP
  ===================================================== */

  async function performSync(context) {

    assertSession(context);

    assert(
      navigator.onLine,
      "OFFLINE",
      "Thiết bị đang mất mạng."
    );

    const health = await PGDAPI.health();

    assert(
      health.requestStateEnabled === true,
      "RECOVERY_API_DISABLED",
      "Backend phục hồi chưa sẵn sàng."
    );

    // Luôn phục hồi yêu cầu cũ trước.

    await recoverInternal(context);

    const local = await PGDDraft.restoreLocal(
      context
    );

    if (!local) {
      return {
        success: true,
        status: "EMPTY"
      };
    }

    assert(
      editable(local.status),
      "LOCKED",
      "Bản nháp không còn được chỉnh sửa."
    );

    let server = await PGDAPI.restoreDraft(context);

    assert(
      local.serverVersion === server.version,
      "VERSION_CONFLICT",
      "Dữ liệu máy chủ đã thay đổi."
    );

    assert(
      editable(server.status),
      "LOCKED",
      "Bản nháp máy chủ đã bị khóa."
    );

    if (!local.dirty) {

      return {
        success: true,
        status: "SYNCED",
        version: server.version
      };

    }

    const snapshot = clone(local);

    const fields = cleanFields(
      snapshot.data, context
    );

    const photos = snapshot.photos || {};

    assert(
      !photos.HA014,
      "LOCK_PHOTO_DISABLED",
      "Chưa kích hoạt ảnh khóa cửa."
    );

    const wasteChanged =
      wasteSignature(fields) !==
      wasteSignature(server.data || {});

    // Backend sẽ xóa giải trình và ảnh hàng hủy
    // khi số lượng hàng hủy thay đổi.

    if (wasteChanged) {

      const firstFields = clone(fields);

      firstFields.wasteNote = "";

      server = await write(
        context,
        "saveDraft",
        {data: firstFields},
        server.version,
        snapshot.localRevision
      );

    }

    if (
      !server.exists ||
      !equal(
        cleanFields(server.data, context),
        fields
      )
    ) {

      server = await write(
        context,
        "saveDraft",
        {data: fields},
        server.version,
        snapshot.localRevision
      );

    }

    // Xóa các liên kết ảnh đã được xóa trên thiết bị.

    for (const id of snapshot.removedPhotos || []) {

      if ((server.photos || {})[id]) {

        server = await write(
          context,
          "removePhoto",
          {photoId: id},
          server.version,
          snapshot.localRevision
        );

      }

    }

    // Gửi ảnh mới hoặc ảnh đã thay đổi.

    for (const id of Object.keys(photos)) {

      const photo = photos[id];

      const remote = (server.photos || {})[id];

      if (
        photo.dirty ||
        !remote ||
        remote.fileId !== photo.fileId
      ) {

        assert(
          typeof photo.data === "string",
          "LOCAL_PHOTO_MISSING",
          "Thiếu dữ liệu ảnh " + id
        );

        server = await write(
          context,
          "savePhoto",
          {
            photoId: id,
            data: photo.data
          },
          server.version,
          snapshot.localRevision
        );

      }

    }

    // Kiểm tra toàn bộ dữ liệu sau khi đồng bộ.

    const latest = await PGDAPI.restoreDraft(context);

    assert(
      latest.version === server.version &&
      editable(latest.status),
      "VERSION_CONFLICT",
      "Máy chủ vừa thay đổi."
    );

    assert(
      equal(
        cleanFields(latest.data, context),
        fields
      ),
      "CONTENT_MISMATCH",
      "Dữ liệu cuối cùng chưa trùng khớp."
    );

    assert(
      equal(
        Object.keys(latest.photos || {}).sort(),
        Object.keys(photos).sort()
      ),
      "PHOTO_SET_MISMATCH",
      "Danh sách ảnh chưa trùng khớp."
    );

    // Đối chiếu nội dung thực tế từng ảnh.

    for (const id of Object.keys(photos)) {

      const image = await PGDAPI.readPhoto(
        context, id
      );

      assert(
        image.data === photos[id].data,
        "PHOTO_CONTENT_MISMATCH",
        "Ảnh chưa trùng khớp: " + id
      );

    }

    const finalServer =
      await PGDAPI.restoreDraft(context);

    assert(
      finalServer.version === latest.version &&
      finalServer.status === latest.status &&
      equal(finalServer.data, latest.data) &&
      equal(finalServer.photos, latest.photos),
      "VERSION_CONFLICT",
      "Máy chủ thay đổi khi kiểm tra cuối."
    );

    // Chỉ đánh dấu sạch nếu thiết bị không có
    // chỉnh sửa mới trong lúc gửi dữ liệu.

    const current = await atomicUpdate(
      context,
      function(record) {

        assert(
          record &&
          record.serverVersion === finalServer.version,
          "LOCAL_VERSION_CHANGED",
          "Phiên bản thiết bị không khớp."
        );

        if (
          record.localRevision !==
            snapshot.localRevision ||
          !editable(record.status)
        ) {
          return record;
        }

        record.dirty = false;

        record.removedPhotos = [];

        Object.keys(record.photos || {})
          .forEach(id => {

            record.photos[id].dirty = false;

            record.photos[id].fileId =
              finalServer.photos[id].fileId;

          });

        record.syncedAt =
          new Date().toISOString();

        return record;

      }
    );

    blocked.delete(keyOf(context));

    return {
      success: true,
      status: current.dirty
        ? "PENDING"
        : "SYNCED",
      version: finalServer.version
    };

  }

  function syncNow(context) {

    const key = keyOf(context);

    if (running.has(key)) {
      return running.get(key);
    }

    const task = withLock(
      context,
      () => performSync(context)
    ).catch(error => {

      if (isBlockingError(error)) {

        blocked.set(key, {
          code: error.code
        });

      }

      throw error;

    }).finally(() => {
      running.delete(key);
    });

    running.set(key, task);

    return task;

  }

  /* =====================================================
     KHÔI PHỤC BẢN NHÁP TỪ MÁY CHỦ
  ===================================================== */

  function restore(context) {

    return withLock(context, async function() {

      assertSession(context);

      // Không ghi đè bản nháp nếu còn yêu cầu cũ.

      await recoverInternal(context);

      const local = await PGDDraft.restoreLocal(
        context
      );

      const server = await PGDAPI.restoreDraft(
        context
      );

      if (local && local.dirty) {

        assert(
          local.serverVersion === server.version,
          "VERSION_CONFLICT",
          "Bản nháp thiết bị khác máy chủ."
        );

        return {
          source: "LOCAL",
          record: local
        };

      }

      if (!server.exists) {

        assert(
          !local || local.serverVersion === 0,
          "SERVER_DRAFT_MISSING",
          "Không tìm thấy bản nháp máy chủ."
        );

        return {
          source: "LOCAL",
          record: local
        };

      }

      assert(
        server.catalogRevision === "751",
        "CATALOG_MISMATCH",
        "Danh mục không tương thích."
      );

      const photos = {};

      for (const id of Object.keys(server.photos || {})) {

        const image = await PGDAPI.readPhoto(
          context, id
        );

        assert(
          typeof image.data === "string" &&
          image.data.startsWith(
            "data:image/jpeg;base64,"
          ) &&
          image.data.length <=
            PGDDraft.config.MAX_PHOTO_LENGTH,
          "INVALID_PHOTO",
          "Không khôi phục được ảnh."
        );

        photos[id] = {
          data: image.data,
          fileId: server.photos[id].fileId,
          dirty: false,
          updatedAt: server.photos[id].receivedAt
        };

      }

      const latest = await PGDAPI.restoreDraft(
        context
      );

      assert(
        latest.version === server.version &&
        latest.status === server.status &&
        equal(latest.data, server.data) &&
        equal(latest.photos, server.photos),
        "VERSION_CONFLICT",
        "Máy chủ thay đổi khi khôi phục."
      );

      const record = await atomicUpdate(
        context,
        function(current, backups) {

          assert(
            Boolean(current) === Boolean(local),
            "LOCAL_CHANGED",
            "Thiết bị vừa thay đổi dữ liệu."
          );

          if (current) {

            assert(
              !current.dirty &&
              current.localRevision ===
                local.localRevision &&
              current.serverVersion ===
                local.serverVersion,
              "LOCAL_CHANGED",
              "Thiết bị vừa thay đổi dữ liệu."
            );

          }

          backupRecord(
            backups,
            current,
            "SERVER_RESTORE"
          );

          const time = new Date().toISOString();

          return {
            key: keyOf(context),
            context: clone(context),
            deviceId: PGDDraft.getDeviceId(),
            catalogRevision: "751",
            data: Object.assign(
              emptyFields(),
              clone(server.data || {})
            ),
            photos: photos,
            removedPhotos: [],
            serverVersion: server.version,
            localRevision: current
              ? current.localRevision + 1
              : 1,
            dirty: false,
            status: server.status,
            createdAt: current
              ? current.createdAt
              : time,
            updatedAt: time,
            syncedAt: time
          };

        }
      );

      blocked.delete(keyOf(context));

      return {
        source: "SERVER",
        record: record
      };

    });

  }

  /* =====================================================
     TRẠNG THÁI ĐỒNG BỘ
  ===================================================== */

  async function getStatus(context) {

    const key = keyOf(context);

    const pending = await PGDOutbox.get(context);

    const record = await PGDDraft.restoreLocal(
      context
    );

    if (
      blocked.has(key) ||
      (pending && pending.status === "BLOCKED")
    ) {

      return {
        status: "BLOCKED",
        details: blocked.get(key) || {
          code: pending.lastError
        }
      };

    }

    if (running.has(key)) {
      return {status: "SYNCING"};
    }

    if (!navigator.onLine) {
      return {status: "OFFLINE"};
    }

    if (pending) {

      return {
        status: "RECOVERY_REQUIRED",
        requestId: pending.requestId,
        attempts: pending.attempts
      };

    }

    if (!record) {
      return {status: "EMPTY"};
    }

    return {
      status: record.dirty
        ? "PENDING"
        : "SYNCED",
      version: record.serverVersion,
      updatedAt: record.updatedAt,
      syncedAt: record.syncedAt
    };

  }

  /* =====================================================
     ĐỒNG BỘ TỰ ĐỘNG
  ===================================================== */

  function start(context, callbacks) {

    callbacks = callbacks || {};

    const key = keyOf(context);

    stop(context);

    let busy = false;
    let stopped = false;

    async function tick() {

      if (
        busy ||
        stopped ||
        !navigator.onLine ||
        blocked.has(key)
      ) return;

      busy = true;

      try {

        const pending = await PGDOutbox.get(
          context
        );

        if (pending && pending.status === "BLOCKED") {
          return;
        }

        const local = await PGDDraft.restoreLocal(
          context
        );

        if (
          pending ||
          (
            local &&
            local.dirty &&
            editable(local.status)
          )
        ) {

          const result = await syncNow(context);

          if (callbacks.onSync) {
            callbacks.onSync(result);
          }

        }

      } catch (error) {

        if (callbacks.onError) {
          callbacks.onError(error);
        }

      } finally {
        busy = false;
      }

    }

    async function refreshStatus() {

      if (stopped || !navigator.onLine) return;

      try {

        const result =
          await PGDAPI.departmentStatus(context);

        if (callbacks.onProgress) {
          callbacks.onProgress(result);
        }

      } catch (error) {

        if (callbacks.onError) {
          callbacks.onError(error);
        }

      }

    }

    const syncTimer = setInterval(
      tick,
      CONFIG.AUTOSAVE_MS
    );

    const statusTimer = setInterval(
      refreshStatus,
      CONFIG.STATUS_REFRESH_MS
    );

    global.addEventListener("online", tick);

    controllers.set(key, {
      stop: function() {
        stopped = true;
        clearInterval(syncTimer);
        clearInterval(statusTimer);
        global.removeEventListener("online", tick);
      }
    });

    return true;

  }

  function stop(context) {

    const key = keyOf(context);

    const controller = controllers.get(key);

    if (controller) {
      controller.stop();
      controllers.delete(key);
    }

  }

  async function inspectConflict(context) {

    assertSession(context);

    const local = await PGDDraft.restoreLocal(
      context
    );

    const server = await PGDAPI.restoreDraft(
      context
    );

    const pending = await PGDOutbox.get(context);

    return {
      localVersion: local
        ? local.serverVersion
        : 0,
      serverVersion: server.version,
      localDirty: Boolean(local && local.dirty),
      localPhotoCount: local
        ? Object.keys(local.photos || {}).length
        : 0,
      serverPhotoCount:
        Object.keys(server.photos || {}).length,
      pendingRequest: Boolean(pending),
      pendingRequestId: pending
        ? pending.requestId
        : null,
      pendingStatus: pending
        ? pending.status
        : null,
      blocked:
        blocked.has(keyOf(context)) ||
        Boolean(
          pending &&
          pending.status === "BLOCKED"
        )
    };

  }

  global.PGDSync = Object.freeze({
    config: CONFIG,
    restore: restore,
    syncNow: syncNow,
    recoverPending: recoverPending,
    getStatus: getStatus,
    start: start,
    stop: stop,
    inspectConflict: inspectConflict
  });

})(window);
