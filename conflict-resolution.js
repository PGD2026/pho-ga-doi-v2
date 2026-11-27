
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: conflict-resolution.js
 * VERSION: 7.8.4.3-B
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.3-B",
    CATALOG_REVISION: "751",
    DB_NAME: "PGD_CONFLICT_BACKUP_V2",
    DB_VERSION: 1,
    STORE_NAME: "conflict_backups"
  });

  const previews = new Map();

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

  function canonical(value) {

    if (value === undefined) return "undefined";

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

  function editable(status) {
    return ["DRAFT", "REJECTED"].includes(status);
  }

  function keyOf(context) {
    return PGDDraft.makeKey(context);
  }

  function assertSession(context) {

    const profile = PGDAPI.getProfile();

    assert(
      profile &&
      profile.code === context.employee &&
      profile.branch === context.branch,
      "LOGIN_REQUIRED",
      "Cần đăng nhập đúng tài khoản."
    );

    assert(
      context.employee.startsWith("TEST_"),
      "TEST_ONLY",
      "Chỉ sử dụng tài khoản kiểm thử."
    );

  }

  function requireModules() {

    assert(
      global.PGDDraft &&
      global.PGDAPI &&
      global.PGDOutbox &&
      global.PGDSync &&
      global.PGDConflict,
      "MODULE_MISSING",
      "Thiếu module hệ thống."
    );

    assert(
      navigator.locks &&
      typeof navigator.locks.request === "function",
      "WEB_LOCKS_UNAVAILABLE",
      "Trình duyệt chưa hỗ trợ Web Locks."
    );

  }

  function withLock(context, callback) {

    requireModules();
    assertSession(context);

    assert(
      navigator.onLine,
      "OFFLINE",
      "Cần kết nối mạng."
    );

    return navigator.locks.request(
      "PGD_SYNC_" + keyOf(context),
      {mode: "exclusive"},
      callback
    );

  }

  /* =====================================================
     01. KHO SAO LƯU XUNG ĐỘT
  ===================================================== */

  function openBackupDatabase() {

    return new Promise((resolve, reject) => {

      const request = indexedDB.open(
        CONFIG.DB_NAME,
        CONFIG.DB_VERSION
      );

      request.onupgradeneeded = function() {

        const db = request.result;

        if (
          !db.objectStoreNames.contains(
            CONFIG.STORE_NAME
          )
        ) {

          const store = db.createObjectStore(
            CONFIG.STORE_NAME,
            {keyPath: "backupId"}
          );

          store.createIndex(
            "draftKey",
            "draftKey",
            {unique: false}
          );

        }

      };

      request.onsuccess = () => {

        const db = request.result;

        db.onversionchange = () => db.close();

        resolve(db);

      };

      request.onerror = () =>
        reject(request.error);

      request.onblocked = () =>
        reject(
          fail(
            "BACKUP_DB_BLOCKED",
            "Kho sao lưu đang bị khóa."
          )
        );

    });

  }

  async function backupOperation(mode, callback) {

    const db = await openBackupDatabase();

    try {

      return await new Promise((resolve, reject) => {

        const tx = db.transaction(
          CONFIG.STORE_NAME,
          mode
        );

        const store = tx.objectStore(
          CONFIG.STORE_NAME
        );

        let result;
        let failure;

        try {

          const request = callback(store);

          request.onsuccess = () => {
            result = request.result;
          };

        } catch (error) {

          failure = error;
          tx.abort();

        }

        tx.oncomplete = () => resolve(result);

        tx.onerror = () =>
          reject(failure || tx.error);

        tx.onabort = () =>
          reject(
            failure ||
            tx.error ||
            fail(
              "BACKUP_FAILED",
              "Không thể lưu bản sao."
            )
          );

      });

    } finally {

      db.close();

    }

  }

  async function readBackup(backupId) {

    return backupOperation(
      "readonly",
      store => store.get(backupId)
    );

  }

  async function saveBackup(record) {

    await backupOperation(
      "readwrite",
      store => store.add(record)
    );

    const saved = await readBackup(
      record.backupId
    );

    assert(
      saved && equal(saved, record),
      "BACKUP_VERIFY_FAILED",
      "Bản sao lưu không trùng khớp."
    );

    return saved;

  }

  async function listBackups(context) {

    assertSession(context);

    const records = await backupOperation(
      "readonly",
      store => store.index("draftKey").getAll(
        keyOf(context)
      )
    );

    return records.map(record => ({

      backupId: record.backupId,

      createdAt: record.createdAt,

      choice: record.choice,

      localVersion: record.local.serverVersion,

      serverVersion: record.server.version,

      localPhotoCount:
        Object.keys(
          record.local.photos || {}
        ).length,

      serverPhotoCount:
        Object.keys(
          record.serverPhotos || {}
        ).length

    }));

  }

  async function getBackup(context, backupId) {

    assertSession(context);

    const record = await readBackup(backupId);

    assert(
      record &&
      record.draftKey === keyOf(context),
      "BACKUP_NOT_FOUND",
      "Không tìm thấy bản sao phù hợp."
    );

    return clone(record);

  }

  /* =====================================================
     02. ĐỌC TOÀN BỘ DỮ LIỆU MÁY CHỦ
  ===================================================== */

  function validPhoto(data) {

    return (
      typeof data === "string" &&
      data.startsWith("data:image/jpeg;base64,") &&
      data.length <= PGDDraft.config.MAX_PHOTO_LENGTH
    );

  }

  async function readServer(context) {

    const server = await PGDAPI.restoreDraft(
      context
    );

    assert(
      server.success === true &&
      server.catalogRevision ===
        CONFIG.CATALOG_REVISION,
      "INVALID_SERVER",
      "Dữ liệu máy chủ không hợp lệ."
    );

    const photos = {};

    for (const id of Object.keys(server.photos || {})) {

      const image = await PGDAPI.readPhoto(
        context,
        id
      );

      assert(
        validPhoto(image.data),
        "INVALID_SERVER_PHOTO",
        "Không đọc được ảnh máy chủ: " + id
      );

      photos[id] = {

        data: image.data,

        fileId: server.photos[id].fileId,

        dirty: false,

        updatedAt:
          server.photos[id].receivedAt ||
          new Date().toISOString()

      };

    }

    const latest = await PGDAPI.restoreDraft(
      context
    );

    assert(
      equal(server, latest),
      "SERVER_CHANGED",
      "Máy chủ thay đổi trong lúc đọc."
    );

    return {
      server: latest,
      serverPhotos: photos
    };

  }

  /* =====================================================
     03. ĐIỀU KIỆN CHO PHÉP XỬ LÝ
  ===================================================== */

  function canResolve(local, server, pending) {

    return Boolean(

      local &&

      server &&

      server.exists === true &&

      local.dirty === true &&

      editable(local.status) &&

      editable(server.status) &&

      Number.isSafeInteger(local.serverVersion) &&

      Number.isSafeInteger(server.version) &&

      local.serverVersion >= 0 &&

      server.version > local.serverVersion &&

      !pending

    );

  }

  function validateChoice(choice) {

    assert(
      ["KEEP_LOCAL", "KEEP_SERVER"].includes(choice),
      "INVALID_CHOICE",
      "Lựa chọn xử lý không hợp lệ."
    );

  }

  async function capture(context) {

    assertSession(context);

    const pending = await PGDOutbox.get(context);

    assert(
      !pending,
      "PENDING_REQUEST",
      "Phải xử lý Outbox trước."
    );

    const local = await PGDDraft.restoreLocal(
      context
    );

    const remote = await readServer(context);

    assert(
      canResolve(
        local,
        remote.server,
        pending
      ),
      "RESOLUTION_NOT_ALLOWED",
      "Không đủ điều kiện xử lý xung đột."
    );

    assert(
      local.catalogRevision ===
        CONFIG.CATALOG_REVISION,
      "CATALOG_MISMATCH",
      "Danh mục thiết bị không tương thích."
    );

    for (const id of Object.keys(local.photos || {})) {

      assert(
        validPhoto(local.photos[id].data),
        "INVALID_LOCAL_PHOTO",
        "Thiếu nội dung ảnh thiết bị: " + id
      );

    }

    const latestLocal =
      await PGDDraft.restoreLocal(context);

    const latestPending =
      await PGDOutbox.get(context);

    assert(
      equal(local, latestLocal) &&
      !latestPending,
      "LOCAL_CHANGED",
      "Dữ liệu thiết bị vừa thay đổi."
    );

    return {

      context: clone(context),

      draftKey: keyOf(context),

      local: clone(local),

      server: clone(remote.server),

      serverPhotos: clone(remote.serverPhotos)

    };

  }

  /* =====================================================
     04. XEM TRƯỚC VÀ XÁC NHẬN
  ===================================================== */

  function preview(context) {

    return withLock(context, async function() {

      const snapshot = await capture(context);

      const previewId = PGDDraft.createId();

      previews.set(
        keyOf(context),
        {
          previewId: previewId,
          snapshot: snapshot
        }
      );

      return {

        success: true,

        previewId: previewId,

        localVersion:
          snapshot.local.serverVersion,

        serverVersion:
          snapshot.server.version,

        localRevision:
          snapshot.local.localRevision,

        localNote:
          snapshot.local.data.generalNote || "",

        serverNote:
          snapshot.server.data.generalNote || "",

        fieldDifferences:
          PGDConflict.compareFields(
            snapshot.local.data,
            snapshot.server.data
          ),

        photoDifferences:
          PGDConflict.comparePhotos(
            snapshot.local.photos,
            snapshot.serverPhotos
          ),

        choices: [
          "KEEP_LOCAL",
          "KEEP_SERVER"
        ]

      };

    });

  }

  /* =====================================================
     05. CHUẨN BỊ PHIÊN BẢN ĐƯỢC CHỌN
  ===================================================== */

  function buildRecord(snapshot, choice) {

    validateChoice(choice);

    const local = snapshot.local;
    const server = snapshot.server;

    const record = clone(local);

    const now = new Date().toISOString();

    record.serverVersion = server.version;

    record.localRevision =
      local.localRevision + 1;

    record.status = server.status;

    record.updatedAt = now;

    if (choice === "KEEP_SERVER") {

      record.data = clone(server.data || {});

      record.photos = clone(
        snapshot.serverPhotos
      );

      record.removedPhotos = [];

      record.dirty = false;

      record.syncedAt = now;

    } else {

      record.data = clone(local.data);

      record.photos = clone(local.photos || {});

      record.removedPhotos =
        Object.keys(server.photos || {}).filter(
          id => !record.photos[id]
        );

      Object.keys(record.photos).forEach(id => {

        const photo = record.photos[id];

        const remote =
          snapshot.serverPhotos[id];

        if (remote && remote.data === photo.data) {

          photo.fileId = remote.fileId;

          photo.dirty = false;

        } else {

          delete photo.fileId;

          photo.dirty = true;

        }

      });

      record.dirty = true;

      record.syncedAt = null;

    }

    return record;

  }

  /* =====================================================
     06. GHI BẢN NHÁP CÓ ĐIỀU KIỆN
  ===================================================== */

  async function replaceLocal(
    context,
    expected,
    replacement
  ) {

    const db = await PGDDraft.openDatabase();

    return new Promise((resolve, reject) => {

      const tx = db.transaction(
        ["drafts"],
        "readwrite"
      );

      const store = tx.objectStore("drafts");

      const request = store.get(keyOf(context));

      let failure;

      request.onsuccess = function() {

        try {

          assert(
            request.result &&
            equal(request.result, expected),
            "LOCAL_CHANGED",
            "Bản nháp thay đổi trước khi xử lý."
          );

          store.put(replacement);

        } catch (error) {

          failure = error;

          tx.abort();

        }

      };

      tx.oncomplete = () =>
        resolve(replacement);

      tx.onerror = () =>
        reject(failure || tx.error);

      tx.onabort = () =>
        reject(
          failure ||
          tx.error ||
          fail(
            "LOCAL_WRITE_FAILED",
            "Không thể cập nhật bản nháp."
          )
        );

    });

  }

  /* =====================================================
     07. THỰC HIỆN XỬ LÝ XUNG ĐỘT
  ===================================================== */

  function resolveConflict(
    context,
    previewId,
    choice,
    confirmed
  ) {

    validateChoice(choice);

    assert(
      confirmed === true,
      "CONFIRMATION_REQUIRED",
      "Cần xác nhận lựa chọn."
    );

    return withLock(context, async function() {

      const prepared = previews.get(
        keyOf(context)
      );

      assert(
        prepared &&
        prepared.previewId === previewId,
        "PREVIEW_REQUIRED",
        "Cần so sánh lại trước khi xử lý."
      );

      const snapshot = await capture(context);

      assert(
        equal(prepared.snapshot, snapshot),
        "PREVIEW_EXPIRED",
        "Dữ liệu đã thay đổi. Cần so sánh lại."
      );

      const backup = {

        backupId: PGDDraft.createId(),

        draftKey: keyOf(context),

        context: clone(context),

        createdAt: new Date().toISOString(),

        moduleVersion: CONFIG.VERSION,

        choice: choice,

        local: clone(snapshot.local),

        server: clone(snapshot.server),

        serverPhotos: clone(
          snapshot.serverPhotos
        )

      };

      // Bắt buộc sao lưu và đọc lại thành công
      // trước khi thay đổi bản nháp.

      await saveBackup(backup);

      const latest = await PGDAPI.restoreDraft(
        context
      );

      assert(
        equal(latest, snapshot.server),
        "SERVER_CHANGED",
        "Máy chủ vừa thay đổi. Bản sao đã được giữ."
      );

      assertSession(context);

      assert(
        !(await PGDOutbox.get(context)),
        "PENDING_REQUEST",
        "Phát hiện yêu cầu Outbox mới."
      );

      const replacement = buildRecord(
        snapshot,
        choice
      );

      await replaceLocal(
        context,
        snapshot.local,
        replacement
      );

      previews.delete(keyOf(context));

      return {

        success: true,

        choice: choice,

        backupId: backup.backupId,

        backupVerified: true,

        serverVersion: replacement.serverVersion,

        localRevision: replacement.localRevision,

        dirty: replacement.dirty,

        serverWritten: false,

        nextAction:
          choice === "KEEP_LOCAL"
            ? "SYNC_REQUIRED"
            : "SERVER_RESTORED"

      };

    });

  }

  /* =====================================================
     08. KIỂM THỬ LOGIC
  ===================================================== */

  function selfTest() {

    const results = [];

    function test(name, callback) {

      try {

        assert(
          callback() === true,
          "TEST_FAILED",
          name
        );

        results.push({
          name: name,
          passed: true
        });

      } catch (error) {

        results.push({
          name: name,
          passed: false,
          message: error.message
        });

      }

    }

    const local = {

      serverVersion: 1,

      localRevision: 5,

      status: "DRAFT",

      dirty: true,

      data: {
        generalNote: "LOCAL"
      },

      photos: {
        HA001: {
          data: "IMAGE_A",
          dirty: true
        }
      },

      removedPhotos: []

    };

    const server = {

      exists: true,

      version: 2,

      status: "DRAFT",

      data: {
        generalNote: "SERVER"
      },

      photos: {
        HA001: {fileId: "FILE_B"},
        HA002: {fileId: "FILE_C"}
      }

    };

    const snapshot = {

      local: local,

      server: server,

      serverPhotos: {

        HA001: {
          data: "IMAGE_B",
          fileId: "FILE_B",
          dirty: false
        },

        HA002: {
          data: "IMAGE_C",
          fileId: "FILE_C",
          dirty: false
        }

      }

    };

    test("01. Phiên bản module", () =>
      CONFIG.VERSION === "7.8.4.3-B"
    );

    test("02. Danh mục 751", () =>
      CONFIG.CATALOG_REVISION === "751"
    );

    test("03. Cho phép xung đột hợp lệ", () =>
      canResolve(local, server, null)
    );

    test("04. Chặn khi còn Outbox", () =>
      !canResolve(local, server, {})
    );

    test("05. Chặn báo cáo SUBMITTED", () =>
      !canResolve(
        local,
        {...server, status: "SUBMITTED"},
        null
      )
    );

    test("06. Chặn báo cáo APPROVED", () =>
      !canResolve(
        local,
        {...server, status: "APPROVED"},
        null
      )
    );

    test("07. Chặn báo cáo FINALIZED", () =>
      !canResolve(
        local,
        {...server, status: "FINALIZED"},
        null
      )
    );

    test("08. Chặn thiết bị bị khóa", () =>
      !canResolve(
        {...local, status: "APPROVED"},
        server,
        null
      )
    );

    test("09. Chặn khi thiếu bản nháp", () =>
      !canResolve(null, server, null)
    );

    test("10. Chặn khi máy chủ không tồn tại", () =>
      !canResolve(
        local,
        {...server, exists: false},
        null
      )
    );

    test("11. Chặn phiên bản giống nhau", () =>
      !canResolve(
        local,
        {...server, version: 1},
        null
      )
    );

    test("12. Chặn phiên bản bất thường", () =>
      !canResolve(
        local,
        {...server, version: 0},
        null
      )
    );

    test("13. Chặn bản nháp sạch", () =>
      !canResolve(
        {...local, dirty: false},
        server,
        null
      )
    );

    test("14. Giữ ghi chú thiết bị", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).data.generalNote === "LOCAL"
    );

    test("15. Giữ ghi chú máy chủ", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).data.generalNote === "SERVER"
    );

    test("16. Cập nhật phiên bản gốc", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).serverVersion === 2
    );

    test("17. Tăng localRevision", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).localRevision === 6
    );

    test("18. Giữ bản thiết bị cần đồng bộ", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).dirty === true
    );

    test("19. Giữ bản máy chủ đánh dấu sạch", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).dirty === false
    );

    test("20. Giữ ảnh thiết bị", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).photos.HA001.data === "IMAGE_A"
    );

    test("21. Giữ ảnh máy chủ", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).photos.HA001.data === "IMAGE_B"
    );

    test("22. Ảnh khác phải gửi lại", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).photos.HA001.dirty === true
    );

    test("23. Ghi nhận ảnh cần loại bỏ", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).removedPhotos.includes("HA002")
    );

    test("24. Bản máy chủ không có ảnh chờ xóa", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).removedPhotos.length === 0
    );

    test("25. Không thay đổi bản gốc", () => {

      const before = JSON.stringify(snapshot);

      buildRecord(snapshot, "KEEP_LOCAL");
      buildRecord(snapshot, "KEEP_SERVER");

      return before === JSON.stringify(snapshot);

    });

    test("26. Chặn lựa chọn không hợp lệ", () => {

      try {
        buildRecord(snapshot, "UNKNOWN");
        return false;
      } catch (error) {
        return error.code === "INVALID_CHOICE";
      }

    });

    test("27. Giữ trạng thái REJECTED", () =>

      buildRecord(
        {
          ...snapshot,
          server: {
            ...server,
            status: "REJECTED"
          }
        },
        "KEEP_LOCAL"
      ).status === "REJECTED"

    );

    test("28. Phát hiện nội dung thay đổi", () =>
      !equal(
        snapshot,
        {
          ...snapshot,
          local: {
            ...local,
            localRevision: 6
          }
        }
      )
    );

    const passed = results.filter(
      item => item.passed
    ).length;

    return {

      success: passed === results.length,

      passed: passed,

      total: results.length,

      results: results

    };

  }

  global.PGDResolution = Object.freeze({

    config: CONFIG,

    preview: preview,

    resolveConflict: resolveConflict,

    listBackups: listBackups,

    getBackup: getBackup,

    selfTest: selfTest

  });

})(window);

/************************************************************
 * KẾT THÚC CONFLICT-RESOLUTION.JS
 ************************************************************/
