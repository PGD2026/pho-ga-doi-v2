
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.8.2
 * FILE: sync.js
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({

    VERSION: "7.8.2",

    CATALOG_REVISION: "751",

    AUTOSAVE_MS: 5000,

    STATUS_REFRESH_MS: 15000

  });

  const running = new Map();

  const blocked = new Map();

  const pending = new Map();

  const controllers = new Map();


  /* =====================================================
     01. HÀM HỖ TRỢ
  ===================================================== */

  function clone(value) {

    return JSON.parse(JSON.stringify(value));

  }


  function fail(code, message) {

    const error = new Error(message);

    error.code = code;

    return error;

  }


  function keyOf(context) {

    return global.PGDDraft.makeKey(context);

  }


  function editable(status) {

    return ["DRAFT", "REJECTED"].includes(status);

  }


  function assertSession(context) {

    const profile = global.PGDAPI.getProfile();

    if (

      !profile ||

      profile.code !== context.employee ||

      profile.branch !== context.branch

    ) {

      throw fail(

        "LOGIN_REQUIRED",

        "Cần đăng nhập đúng tài khoản và cơ sở."

      );

    }

  }


  function wasteSignature(fields) {

    const inventory = fields.inventory || {};

    return JSON.stringify(

      Object.keys(inventory)

        .sort()

        .filter(id => Number(inventory[id].waste) > 0)

        .map(id => [id, inventory[id].waste])

    );

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


  /* =====================================================
     02. CẬP NHẬT INDEXED DB AN TOÀN
  ===================================================== */

  async function atomicUpdate(context, updater) {

    const db = await global.PGDDraft.openDatabase();

    const key = keyOf(context);

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(

        ["drafts", "draft_backups"],

        "readwrite"

      );

      const store = tx.objectStore("drafts");

      const backups = tx.objectStore("draft_backups");

      const request = store.get(key);

      let result;

      let failure;

      request.onsuccess = function() {

        try {

          result = updater(

            request.result || null,

            backups

          );

          if (result) {

            store.put(result);

          }

        } catch (error) {

          failure = error;

          tx.abort();

        }

      };

      tx.oncomplete = function() {

        resolve(result);

      };

      tx.onerror = function() {

        reject(failure || tx.error);

      };

      tx.onabort = function() {

        reject(

          failure ||

          tx.error ||

          new Error("Không cập nhật được IndexedDB.")

        );

      };

    });

  }


  /* =====================================================
     03. SAO LƯU BẢN NHÁP
  ===================================================== */

  function backupRecord(store, record, reason) {

    if (!record) return;

    store.put({

      backupId: global.PGDDraft.createId(),

      draftKey: record.key,

      reason: reason,

      backedUpAt: new Date().toISOString(),

      record: clone(record)

    });

  }


  /* =====================================================
     04. KHÔI PHỤC TỪ MÁY CHỦ
  ===================================================== */

  async function restore(context) {

    assertSession(context);

    const key = keyOf(context);

    if (running.has(key) || pending.has(key)) {

      throw fail(

        "SYNC_BUSY",

        "Đang có yêu cầu đồng bộ chưa hoàn tất."

      );

    }

    const local = await global.PGDDraft.restoreLocal(context);

    const server = await global.PGDAPI.restoreDraft(context);

    if (local && local.dirty) {

      if (local.serverVersion !== server.version) {

        blocked.set(key, {

          code: "VERSION_CONFLICT",

          server: server

        });

        throw fail(

          "VERSION_CONFLICT",

          "Bản nháp trên máy chủ khác bản nháp điện thoại."

        );

      }

      return {

        source: "LOCAL",

        record: local

      };

    }

    if (!server.exists) {

      if (local && local.serverVersion > 0) {

        throw fail(

          "SERVER_DRAFT_MISSING",

          "Không tìm thấy bản nháp đã đồng bộ."

        );

      }

      return {

        source: "LOCAL",

        record: local

      };

    }

    if (server.catalogRevision !== "751") {

      throw fail(

        "CATALOG_MISMATCH",

        "Danh mục máy chủ không tương thích."

      );

    }

    const photos = {};

    for (const id of Object.keys(server.photos || {})) {

      const image = await global.PGDAPI.readPhoto(

        context,

        id

      );

      if (

        typeof image.data !== "string" ||

        !image.data.startsWith("data:image/jpeg;base64,") ||

        image.data.length >

          global.PGDDraft.config.MAX_PHOTO_LENGTH

      ) {

        throw fail(

          "INVALID_PHOTO",

          "Không khôi phục được ảnh " + id

        );

      }

      photos[id] = {

        data: image.data,

        fileId: server.photos[id].fileId,

        dirty: false,

        updatedAt: server.photos[id].receivedAt

      };

    }

    // Kiểm tra máy chủ không thay đổi trong lúc tải ảnh.

    const latest = await global.PGDAPI.restoreDraft(context);

    if (

      latest.version !== server.version ||

      latest.status !== server.status

    ) {

      throw fail(

        "VERSION_CONFLICT",

        "Máy chủ vừa thay đổi. Hãy khôi phục lại."

      );

    }

    const record = await atomicUpdate(

      context,

      function(current, backups) {

        if (

          current && (

            current.dirty ||

            !local ||

            current.localRevision !== local.localRevision ||

            current.serverVersion !== local.serverVersion

          )

        ) {

          throw fail(

            "LOCAL_CHANGED",

            "Điện thoại vừa phát sinh dữ liệu mới."

          );

        }

        backupRecord(

          backups,

          current,

          "SERVER_RESTORE"

        );

        return {

          key: key,

          context: clone(context),

          deviceId: global.PGDDraft.getDeviceId(),

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

            : new Date().toISOString(),

          updatedAt: new Date().toISOString(),

          syncedAt: new Date().toISOString()

        };

      }

    );

    blocked.delete(key);

    return {

      source: "SERVER",

      record: record

    };

  }


  /* =====================================================
     05. KIỂM TRA PHẢN HỒI GHI
  ===================================================== */

  function checkWriteResult(result, version) {

    if (

      !result ||

      result.success !== true ||

      !Number.isInteger(result.version) ||

      result.version < version ||

      result.version > version + 1 ||

      result.catalogRevision !== "751"

    ) {

      throw fail(

        "INVALID_WRITE_RESULT",

        "Chưa xác nhận được kết quả ghi dữ liệu."

      );

    }

    return result;

  }


  /* =====================================================
     06. GHI TỪNG YÊU CẦU
     Không tự tạo requestId mới khi mất phản hồi.
  ===================================================== */

  async function write(context, action, payload, version) {

    const key = keyOf(context);

    const requestId = global.PGDDraft.createId();

    pending.set(key, {

      action: action,

      payload: clone(payload),

      version: version,

      requestId: requestId

    });

    let result;

    try {

      if (action === "saveDraft") {

        result = await global.PGDAPI.saveDraft(

          context,

          payload.data,

          version,

          requestId

        );

      } else if (action === "savePhoto") {

        result = await global.PGDAPI.savePhoto(

          context,

          payload.photoId,

          payload.data,

          version,

          requestId

        );

      } else if (action === "removePhoto") {

        result = await global.PGDAPI.removePhoto(

          context,

          payload.photoId,

          version,

          requestId

        );

      } else {

        throw fail(

          "INVALID_ACTION",

          "Thao tác đồng bộ không hợp lệ."

        );

      }

      checkWriteResult(result, version);

      return result;

    } catch (error) {

      if (error.code === "VERSION_CONFLICT") {

        pending.delete(key);

      }

      throw error;

    }

  }


  /* =====================================================
     07. GHI NHẬN PHIÊN BẢN TỪNG BƯỚC
  ===================================================== */

  async function acknowledge(

    context,

    oldVersion,

    result,

    photoId,

    sentPhoto

  ) {

    const key = keyOf(context);

    await atomicUpdate(context, function(record) {

      if (!record) {

        throw fail(

          "LOCAL_MISSING",

          "Không tìm thấy bản nháp điện thoại."

        );

      }

      if (record.serverVersion !== oldVersion) {

        throw fail(

          "LOCAL_VERSION_CHANGED",

          "Phiên bản điện thoại vừa thay đổi."

        );

      }

      record.serverVersion = result.version;

      if (

        photoId &&

        sentPhoto &&

        record.photos[photoId] &&

        record.photos[photoId].data === sentPhoto.data &&

        record.photos[photoId].updatedAt === sentPhoto.updatedAt &&

        result.photos &&

        result.photos[photoId]

      ) {

        record.photos[photoId].fileId =

          result.photos[photoId].fileId;

        record.photos[photoId].dirty = false;

      }

      // Chưa được đánh dấu đồng bộ hoàn toàn.

      record.dirty = true;

      return record;

    });

    pending.delete(key);

  }


  /* =====================================================
     08. ĐỒNG BỘ BẢN NHÁP
  ===================================================== */

  async function performSync(context) {

    assertSession(context);

    const key = keyOf(context);

    if (blocked.has(key) || pending.has(key)) {

      throw fail(

        "SYNC_BLOCKED",

        "Cần kiểm tra yêu cầu đồng bộ trước đó."

      );

    }

    if (!navigator.onLine) {

      return {

        success: false,

        status: "OFFLINE"

      };

    }

    const local = await global.PGDDraft.restoreLocal(context);

    if (!local) {

      return {

        success: true,

        status: "EMPTY"

      };

    }

    if (!editable(local.status)) {

      return {

        success: true,

        status: "LOCKED"

      };

    }

    if (!local.dirty) {

      return {

        success: true,

        status: "SYNCED",

        version: local.serverVersion

      };

    }

    const snapshot = clone(local);

    if (

      snapshot.catalogRevision !== "751"

    ) {

      throw fail(

        "CATALOG_MISMATCH",

        "Bản nháp không đúng danh mục 751."

      );

    }

    const server = await global.PGDAPI.restoreDraft(context);

    if (

      server.version !== snapshot.serverVersion ||

      !editable(server.status)

    ) {

      throw fail(

        "VERSION_CONFLICT",

        "Dữ liệu máy chủ đã thay đổi."

      );

    }

    let version = server.version;

    let result;

    const fields = clone(snapshot.data);

    // Không cho trình duyệt tự nghiệm thu hoặc khóa cửa.

    if (context.department === "TRUONG_CA") {

      ["CL033", "CL034", "CL035", "CL036", "CL047"]

        .forEach(id => delete fields.checklist[id]);

      if (snapshot.photos.HA014) {

        throw fail(

          "FINAL_LOCK_DISABLED",

          "Ảnh khóa cửa chỉ được mở ở giai đoạn 7.10."

        );

      }

    }

    const wasteChanged =

      wasteSignature(server.data || {}) !==

      wasteSignature(fields);

    const wasteNote = fields.wasteNote || "";

    // Bước 1: lưu số lượng và nội dung.

    if (wasteChanged) {

      fields.wasteNote = "";

    }

    result = await write(

      context,

      "saveDraft",

      {data: fields},

      version

    );

    await acknowledge(context, version, result);

    version = result.version;


    // Bước 2: lưu giải trình sau khi số lượng đã cập nhật.

    if (wasteChanged && wasteNote.trim()) {

      fields.wasteNote = wasteNote;

      result = await write(

        context,

        "saveDraft",

        {data: fields},

        version

      );

      await acknowledge(context, version, result);

      version = result.version;

    }


    // Bước 3: xóa các liên kết ảnh không còn sử dụng.

    for (const id of snapshot.removedPhotos || []) {

      if (snapshot.photos[id]) continue;

      if (!(result.photos || {})[id]) continue;

      result = await write(

        context,

        "removePhoto",

        {photoId: id},

        version

      );

      await acknowledge(context, version, result);

      version = result.version;

    }


    // Bước 4: gửi ảnh lần lượt.

    const ids = Object.keys(snapshot.photos || {}).sort();

    for (const id of ids) {

      const photo = snapshot.photos[id];

      const remote = (result.photos || {})[id];

      if (

        !photo.dirty &&

        remote &&

        photo.fileId === remote.fileId

      ) {

        continue;

      }

      if (!photo.data) {

        throw fail(

          "PHOTO_MISSING",

          "Thiếu dữ liệu ảnh " + id

        );

      }

      result = await write(

        context,

        "savePhoto",

        {

          photoId: id,

          data: photo.data

        },

        version

      );

      if (!(result.photos || {})[id]) {

        throw fail(

          "PHOTO_NOT_CONFIRMED",

          "Máy chủ chưa xác nhận ảnh " + id

        );

      }

      await acknowledge(

        context,

        version,

        result,

        id,

        photo

      );

      version = result.version;

    }


    // Bước 5: kiểm tra lại dữ liệu máy chủ.

    const confirmed = await global.PGDAPI.restoreDraft(context);

    if (

      confirmed.version !== version ||

      !editable(confirmed.status)

    ) {

      throw fail(

        "VERSION_CONFLICT",

        "Máy chủ vừa phát sinh thay đổi."

      );

    }

    const remoteIds = Object.keys(

      confirmed.photos || {}

    ).sort();

    if (JSON.stringify(ids) !== JSON.stringify(remoteIds)) {

      throw fail(

        "PHOTO_MISMATCH",

        "Danh sách ảnh máy chủ chưa khớp điện thoại."

      );

    }


    // Bước 6: chỉ đánh dấu sạch nếu không có thay đổi mới.

    const saved = await global.PGDDraft.markSynced(

      context,

      version,

      snapshot.localRevision

    );

    return {

      success: true,

      status: saved.dirty

        ? "PENDING_CHANGES"

        : "SYNCED",

      version: version,

      photoCount: ids.length

    };

  }


  /* =====================================================
     09. CHỐNG ĐỒNG BỘ TRÙNG
  ===================================================== */

  function syncNow(context) {

    const key = keyOf(context);

    if (running.has(key)) {

      return running.get(key);

    }

    const task = performSync(context)

      .catch(function(error) {

        if (

          error.code === "VERSION_CONFLICT" ||

          pending.has(key)

        ) {

          blocked.set(key, {

            code: error.code || "SYNC_ERROR",

            message: error.message

          });

        }

        throw error;

      })

      .finally(function() {

        running.delete(key);

      });

    running.set(key, task);

    return task;

  }


  /* =====================================================
     10. TRẠNG THÁI ĐỒNG BỘ
  ===================================================== */

  async function getStatus(context) {

    const key = keyOf(context);

    const record = await global.PGDDraft.restoreLocal(context);

    if (blocked.has(key)) {

      return {

        status: "BLOCKED",

        details: blocked.get(key)

      };

    }

    if (running.has(key)) {

      return {status: "SYNCING"};

    }

    if (!navigator.onLine) {

      return {status: "OFFLINE"};

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
     11. ĐỒNG BỘ TỰ ĐỘNG
  ===================================================== */

  function start(context, callbacks) {

    callbacks = callbacks || {};

    const key = keyOf(context);

    stop(context);

    let busy = false;

    let stopped = false;

    async function tick() {

      if (busy || stopped) return;

      if (blocked.has(key)) return;

      busy = true;

      try {

        const record = await global.PGDDraft.restoreLocal(context);

        if (

          navigator.onLine &&

          record &&

          record.dirty &&

          editable(record.status)

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

        const result = await global.PGDAPI.departmentStatus(

          context

        );

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


  /* =====================================================
     12. KIỂM TRA XUNG ĐỘT
     Không tự ghi đè dữ liệu.
  ===================================================== */

  async function inspectConflict(context) {

    assertSession(context);

    const key = keyOf(context);

    const local = await global.PGDDraft.restoreLocal(context);

    const server = await global.PGDAPI.restoreDraft(context);

    return {

      localVersion: local ? local.serverVersion : 0,

      serverVersion: server.version,

      localDirty: Boolean(local && local.dirty),

      localPhotoCount: local

        ? Object.keys(local.photos || {}).length

        : 0,

      serverPhotoCount:

        Object.keys(server.photos || {}).length,

      pendingRequest: pending.has(key),

      blocked: blocked.has(key)

    };

  }


  /* =====================================================
     13. XUẤT MODULE
  ===================================================== */

  global.PGDSync = Object.freeze({

    config: CONFIG,

    restore: restore,

    syncNow: syncNow,

    getStatus: getStatus,

    start: start,

    stop: stop,

    inspectConflict: inspectConflict

  });

})(window);

/************************************************************
 * KẾT THÚC SYNC.JS
 ************************************************************/
