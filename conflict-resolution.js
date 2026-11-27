
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: conflict-resolution.js
 * VERSION: 7.8.4.3-C2.3-C2
 *
 * Bắt buộc sao lưu IndexedDB + Google Drive.
 * Bắt buộc xác minh độc lập trước khi xử lý.
 * Sử dụng chung Web Lock với PGDCloudBackup.
 * Không ghi trực tiếp dữ liệu nghiệp vụ lên máy chủ.
 * Chỉ sử dụng tài khoản TEST.
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({

    VERSION: "7.8.4.3-C2.3-C2",

    CATALOG_REVISION: "751",

    CLOUD_BACKUP_VERSION: "7.8.4.3-C2.3-C1",

    VERIFY_VERSION: "7.8.4.3-C2.1",

    DB_NAME: "PGD_CONFLICT_BACKUP_V2",

    DB_VERSION: 1,

    STORE_NAME: "conflict_backups",

    CHOICES: Object.freeze([
      "KEEP_LOCAL",
      "KEEP_SERVER"
    ]),

    EDITABLE: Object.freeze([
      "DRAFT",
      "REJECTED"
    ])

  });

  const previews = new Map();

  /* =====================================================
     01. TIỆN ÍCH
  ===================================================== */

  function fail(code, message) {

    const error = new Error(message || code);

    error.code = code;

    return error;

  }

  function assert(condition, code, message) {

    if (!condition) {

      throw fail(code, message);

    }

  }

  function clone(value) {

    return JSON.parse(JSON.stringify(value));

  }

  function canonical(value) {

    if (value === undefined) {

      return "undefined";

    }

    if (Array.isArray(value)) {

      return "[" +
        value.map(canonical).join(",") +
        "]";

    }

    if (value && typeof value === "object") {

      return "{" +
        Object.keys(value)
          .sort()
          .map(key =>
            JSON.stringify(key) +
            ":" +
            canonical(value[key])
          )
          .join(",") +
        "}";

    }

    return JSON.stringify(value);

  }

  function equal(a, b) {

    return canonical(a) === canonical(b);

  }

  function editable(status) {

    return CONFIG.EDITABLE.includes(status);

  }

  function keyOf(context) {

    return PGDDraft.makeKey(context);

  }

  function validHash(hash) {

    return typeof hash === "string" &&
      /^[a-f0-9]{64}$/.test(hash);

  }

  function validateChoice(choice) {

    assert(
      CONFIG.CHOICES.includes(choice),
      "INVALID_CHOICE",
      "Lựa chọn xử lý không hợp lệ."
    );

  }

  function notify(callback, stage, details) {

    if (typeof callback !== "function") {

      return;

    }

    try {

      callback({

        stage: stage,

        details: details || {}

      });

    } catch (_) {

      // Lỗi giao diện không thay đổi kết quả xử lý.

    }

  }

  /* =====================================================
     02. KIỂM TRA MODULE VÀ PHIÊN ĐĂNG NHẬP
  ===================================================== */

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
      global.PGDCloudBackup,
      "CLOUD_BACKUP_REQUIRED",
      "Chưa tải module sao lưu Google Drive."
    );

    assert(
      PGDCloudBackup.config.VERSION ===
        CONFIG.CLOUD_BACKUP_VERSION,
      "CLOUD_BACKUP_VERSION_MISMATCH",
      "Phiên bản Cloud Backup không tương thích."
    );

    assert(
      PGDDraft.config.CATALOG_REVISION ===
        CONFIG.CATALOG_REVISION,
      "CATALOG_MISMATCH"
    );

    const required = [

      "withSession",

      "captureInSession",

      "backupInSession",

      "verifyInSession",

      "hashJson",

      "hashPhotos"

    ];

    for (const name of required) {

      assert(
        typeof PGDCloudBackup[name] === "function",
        "CLOUD_BACKUP_METHOD_MISSING",
        "Thiếu hàm: " + name
      );

    }

    assert(
      navigator.locks &&
      typeof navigator.locks.request === "function",
      "WEB_LOCKS_UNAVAILABLE",
      "Trình duyệt chưa hỗ trợ Web Locks."
    );

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
      /^TEST_/.test(context.employee),
      "TEST_ONLY",
      "Chỉ sử dụng tài khoản kiểm thử."
    );

  }

  function assertOnline() {

    assert(
      navigator.onLine !== false,
      "OFFLINE",
      "Cần kết nối mạng để xử lý xung đột."
    );

  }

  /* =====================================================
     03. KHO SAO LƯU INDEXEDDB

     Giữ nguyên DB_NAME, DB_VERSION và STORE_NAME.
     Không xóa hoặc nâng cấp cấu trúc cũ.
  ===================================================== */

  function openBackupDatabase() {

    return new Promise((resolve, reject) => {

      const request = indexedDB.open(

        CONFIG.DB_NAME,

        CONFIG.DB_VERSION

      );

      let blocked = false;

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

      request.onsuccess = function() {

        const db = request.result;

        if (blocked) {

          db.close();

          return;

        }

        db.onversionchange = () => db.close();

        resolve(db);

      };

      request.onerror = () =>
        reject(request.error);

      request.onblocked = function() {

        blocked = true;

        reject(
          fail(
            "BACKUP_DB_BLOCKED",
            "Kho sao lưu đang bị khóa."
          )
        );

      };

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

        try {

          const request = callback(store);

          request.onsuccess = function() {

            result = request.result;

          };

        } catch (error) {

          failure = error;

          tx.abort();

        }

      });

    } finally {

      db.close();

    }

  }

  function readBackup(backupId) {

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
      "Bản sao lưu IndexedDB không trùng khớp."
    );

    return saved;

  }

  async function updateBackup(expected, replacement) {

    const db = await openBackupDatabase();

    try {

      await new Promise((resolve, reject) => {

        const tx = db.transaction(

          CONFIG.STORE_NAME,

          "readwrite"

        );

        const store = tx.objectStore(
          CONFIG.STORE_NAME
        );

        let failure;

        tx.oncomplete = () => resolve(true);

        tx.onerror = () =>
          reject(failure || tx.error);

        tx.onabort = () =>
          reject(
            failure ||
            tx.error ||
            fail("BACKUP_UPDATE_FAILED")
          );

        const request = store.get(
          expected.backupId
        );

        request.onsuccess = function() {

          try {

            assert(
              request.result &&
              equal(request.result, expected),
              "BACKUP_CHANGED"
            );

            assert(
              replacement.backupId ===
                expected.backupId,
              "BACKUP_ID_MISMATCH"
            );

            store.put(replacement);

          } catch (error) {

            failure = error;

            tx.abort();

          }

        };

      });

    } finally {

      db.close();

    }

    const saved = await readBackup(
      replacement.backupId
    );

    assert(
      saved &&
      equal(saved, replacement),
      "BACKUP_UPDATE_VERIFY_FAILED"
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
        ).length,

      cloudBackupId:
        record.cloudBackupId || null,

      cloudVerified:
        record.cloudVerified === true,

      backupStatus:
        record.backupStatus || "LEGACY_LOCAL_ONLY",

      moduleVersion:
        record.moduleVersion || ""

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
     04. ĐIỀU KIỆN XỬ LÝ
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

      Number.isSafeInteger(local.localRevision) &&

      Number.isSafeInteger(server.version) &&

      local.serverVersion >= 0 &&

      local.localRevision >= 0 &&

      server.version > local.serverVersion &&

      !pending

    );

  }

  function validateSnapshot(snapshot) {

    assert(
      snapshot &&
      snapshot.local &&
      snapshot.server &&
      snapshot.context &&
      snapshot.serverPhotos,
      "INVALID_SNAPSHOT"
    );

    assert(
      canResolve(
        snapshot.local,
        snapshot.server,
        null
      ),
      "RESOLUTION_NOT_ALLOWED"
    );

    assert(
      snapshot.local.catalogRevision ===
        CONFIG.CATALOG_REVISION &&
      snapshot.server.catalogRevision ===
        CONFIG.CATALOG_REVISION,
      "CATALOG_MISMATCH"
    );

    assert(
      snapshot.draftKey === keyOf(snapshot.context),
      "DRAFT_KEY_MISMATCH"
    );

    return true;

  }

  /* =====================================================
     05. CHUẨN HÓA ẢNH MÁY CHỦ

     Cloud Backup lưu nội dung ảnh.
     Resolution bổ sung metadata từ server.photos.
  ===================================================== */

  function serverPhotosForRecord(snapshot) {

    const result = {};

    const metadata =
      snapshot.server.photos || {};

    const photos =
      snapshot.serverPhotos || {};

    assert(
      equal(
        Object.keys(metadata).sort(),
        Object.keys(photos).sort()
      ),
      "SERVER_PHOTO_SET_MISMATCH"
    );

    for (const id of Object.keys(metadata)) {

      const photo = photos[id];

      const meta = metadata[id];

      assert(
        photo &&
        typeof photo.data === "string" &&
        meta &&
        typeof meta.fileId === "string" &&
        meta.fileId.length > 0,
        "INVALID_SERVER_PHOTO",
        "Ảnh máy chủ không hợp lệ: " + id
      );

      result[id] = {

        data: photo.data,

        fileId: meta.fileId,

        dirty: false,

        updatedAt:
          meta.receivedAt ||
          snapshot.server.updatedAt ||
          new Date().toISOString()

      };

    }

    return result;

  }

  /* =====================================================
     06. XEM TRƯỚC XUNG ĐỘT

     Không thay đổi bản nháp.
     Không tạo sao lưu Google Drive ở bước preview.
  ===================================================== */

  function preview(context) {

    requireModules();

    const safeContext = clone(context);

    assertSession(safeContext);

    assertOnline();

    return PGDCloudBackup.withSession(

      safeContext,

      async function(token) {

        const snapshot =
          await PGDCloudBackup.captureInSession(
            token
          );

        validateSnapshot(snapshot);

        const previewId = PGDDraft.createId();

        previews.set(

          keyOf(safeContext),

          {

            previewId: previewId,

            snapshot: clone(snapshot)

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

              serverPhotosForRecord(snapshot)

            ),

          cloudBackupRequired: true,

          localBackupRequired: true,

          choices: CONFIG.CHOICES.slice()

        };

      }

    );

  }

  /* =====================================================
     07. CHUẨN BỊ BẢN GHI ĐƯỢC CHỌN
  ===================================================== */

  function buildRecord(snapshot, choice) {

    validateChoice(choice);

    const local = snapshot.local;

    const server = snapshot.server;

    const remotePhotos =
      serverPhotosForRecord(snapshot);

    const record = clone(local);

    const now = new Date().toISOString();

    record.serverVersion = server.version;

    record.localRevision =
      local.localRevision + 1;

    record.status = server.status;

    record.updatedAt = now;

    if (choice === "KEEP_SERVER") {

      record.data = clone(server.data || {});

      record.photos = clone(remotePhotos);

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

        const remote = remotePhotos[id];

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
     08. KIỂM TRA BIÊN NHẬN CLOUD BACKUP
  ===================================================== */

  function assertHashMap(map) {

    assert(
      map &&
      typeof map === "object" &&
      !Array.isArray(map),
      "INVALID_HASH_MAP"
    );

    for (const id of Object.keys(map)) {

      assert(
        validHash(map[id]),
        "INVALID_PHOTO_HASH"
      );

    }

    return true;

  }

  function assertCloudReceipt(

    receipt,

    snapshot,

    choice,

    backupId

  ) {

    assert(
      receipt &&
      receipt.success === true &&
      receipt.status === "VERIFIED" &&
      receipt.contentVerified === true,
      "CLOUD_BACKUP_NOT_VERIFIED",
      "Bản sao Google Drive chưa được xác minh."
    );

    assert(
      receipt.backupId === backupId,
      "CLOUD_BACKUP_ID_MISMATCH"
    );

    assert(
      receipt.draftKey === snapshot.draftKey,
      "CLOUD_DRAFT_KEY_MISMATCH"
    );

    assert(
      receipt.choice === choice,
      "CLOUD_CHOICE_MISMATCH"
    );

    assert(
      receipt.localVersion ===
        snapshot.local.serverVersion &&
      receipt.localRevision ===
        snapshot.local.localRevision &&
      receipt.serverVersion ===
        snapshot.server.version,
      "CLOUD_VERSION_MISMATCH"
    );

    assert(
      validHash(receipt.localHash) &&
      validHash(receipt.serverHash),
      "CLOUD_HASH_INVALID"
    );

    assertHashMap(receipt.localPhotoHashes);

    assertHashMap(receipt.serverPhotoHashes);

    assert(
      equal(
        Object.keys(
          receipt.localPhotoHashes
        ).sort(),
        Object.keys(
          snapshot.local.photos || {}
        ).sort()
      ) &&
      equal(
        Object.keys(
          receipt.serverPhotoHashes
        ).sort(),
        Object.keys(
          snapshot.serverPhotos || {}
        ).sort()
      ),
      "CLOUD_PHOTO_SET_MISMATCH"
    );

    assert(
      receipt.resolutionAuthorized === false &&
      receipt.businessDataWritten === false,
      "CLOUD_UNEXPECTED_WRITE"
    );

    const confirmation = receipt.confirmation;

    assert(
      confirmation &&
      confirmation.success === true &&
      confirmation.status === "VERIFIED" &&
      confirmation.contentVerified === true &&
      confirmation.verificationVersion ===
        CONFIG.VERIFY_VERSION &&
      confirmation.catalogRevision ===
        CONFIG.CATALOG_REVISION &&
      confirmation.backupId === backupId &&
      confirmation.draftId === snapshot.draftKey &&
      confirmation.choice === choice &&
      confirmation.localVersion ===
        receipt.localVersion &&
      confirmation.localRevision ===
        receipt.localRevision &&
      confirmation.serverVersion ===
        receipt.serverVersion &&
      confirmation.localHash === receipt.localHash &&
      confirmation.serverHash === receipt.serverHash &&
      equal(
        confirmation.localPhotoHashes,
        receipt.localPhotoHashes
      ) &&
      equal(
        confirmation.serverPhotoHashes,
        receipt.serverPhotoHashes
      ) &&
      confirmation.localPhotoCount ===
        Object.keys(receipt.localPhotoHashes).length &&
      confirmation.serverPhotoCount ===
        Object.keys(receipt.serverPhotoHashes).length &&
      confirmation.serverWritten === false &&
      confirmation.businessDataWritten === false &&
      confirmation.resolutionAuthorized === false &&
      confirmation.resolutionIntegrated === false,
      "INDEPENDENT_VERIFICATION_REQUIRED"
    );

    return true;

  }

  async function verifySnapshotHashes(

    receipt,

    snapshot

  ) {

    const localHash =
      await PGDCloudBackup.hashJson(
        snapshot.local.data
      );

    const serverHash =
      await PGDCloudBackup.hashJson(
        snapshot.server
      );

    const localPhotoHashes =
      await PGDCloudBackup.hashPhotos(
        snapshot.local.photos
      );

    const serverPhotoHashes =
      await PGDCloudBackup.hashPhotos(
        snapshot.serverPhotos
      );

    assert(
      receipt.localHash === localHash &&
      receipt.serverHash === serverHash &&
      equal(
        receipt.localPhotoHashes,
        localPhotoHashes
      ) &&
      equal(
        receipt.serverPhotoHashes,
        serverPhotoHashes
      ),
      "CLOUD_CONTENT_HASH_MISMATCH"
    );

    return true;

  }

  function assertSameReceipt(first, final) {

    const fields = [

      "backupId",

      "draftKey",

      "choice",

      "localVersion",

      "localRevision",

      "serverVersion",

      "localHash",

      "serverHash",

      "localPhotoHashes",

      "serverPhotoHashes"

    ];

    for (const field of fields) {

      assert(
        equal(first[field], final[field]),
        "FINAL_RECEIPT_MISMATCH",
        "Biên nhận cuối khác tại: " + field
      );

    }

    return true;

  }

  /* =====================================================
     09. KIỂM TRA DỮ LIỆU TRƯỚC KHI GHI
  ===================================================== */

  async function assertCurrent(snapshot) {

    const context = snapshot.context;

    assertOnline();

    assertSession(context);

    const pending =
      await PGDOutbox.get(context);

    assert(
      !pending,
      "PENDING_REQUEST"
    );

    const local =
      await PGDDraft.restoreLocal(context);

    assert(
      local &&
      equal(local, snapshot.local),
      "LOCAL_CHANGED"
    );

    const server =
      await PGDAPI.restoreDraft(context);

    assert(
      equal(server, snapshot.server),
      "SERVER_CHANGED"
    );

    const latestLocal =
      await PGDDraft.restoreLocal(context);

    assert(
      latestLocal &&
      equal(latestLocal, snapshot.local),
      "LOCAL_CHANGED"
    );

    assert(
      !(await PGDOutbox.get(context)),
      "PENDING_REQUEST"
    );

    assertSession(context);

    assertOnline();

    return true;

  }

  /* =====================================================
     10. GIAO DỊCH GHI INDEXEDDB CÓ ĐIỀU KIỆN

     So sánh bản ghi thực tế trong cùng giao dịch.
     Nếu bản ghi thay đổi thì abort.
  ===================================================== */

  async function replaceLocal(

    context,

    expected,

    replacement

  ) {

    const db = await PGDDraft.openDatabase();

    assertSession(context);

    assertOnline();

    return new Promise((resolve, reject) => {

      const tx = db.transaction(

        ["drafts"],

        "readwrite"

      );

      const store = tx.objectStore("drafts");

      let failure;

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

      const request = store.get(
        keyOf(context)
      );

      request.onsuccess = function() {

        try {

          assertSession(context);

          assertOnline();

          assert(
            request.result &&
            equal(request.result, expected),
            "LOCAL_CHANGED",
            "Bản nháp thay đổi trước khi xử lý."
          );

          assert(
            replacement.key === keyOf(context),
            "DRAFT_KEY_MISMATCH"
          );

          assert(
            replacement.localRevision ===
              expected.localRevision + 1,
            "LOCAL_REVISION_MISMATCH"
          );

          store.put(replacement);

        } catch (error) {

          failure = error;

          tx.abort();

        }

      };

    });

  }

  /* =====================================================
     11. TẠO BẢN SAO LƯU LOCAL
  ===================================================== */

  function createBackupRecord(

    snapshot,

    choice,

    backupId

  ) {

    return {

      backupId: backupId,

      cloudBackupId: backupId,

      draftKey: snapshot.draftKey,

      context: clone(snapshot.context),

      createdAt: new Date().toISOString(),

      moduleVersion: CONFIG.VERSION,

      choice: choice,

      local: clone(snapshot.local),

      server: clone(snapshot.server),

      serverPhotos:
        serverPhotosForRecord(snapshot),

      cloudVerified: false,

      cloudReceipt: null,

      finalReceipt: null,

      backupStatus: "LOCAL_BACKUP_SAVED"

    };

  }

  /* =====================================================
     12. CỔNG KIỂM TRA CUỐI CÙNG
  ===================================================== */

  function assertCommitGate(

    localBackup,

    firstReceipt,

    finalReceipt,

    snapshot,

    choice,

    backupId

  ) {

    assert(
      localBackup &&
      localBackup.backupId === backupId &&
      localBackup.cloudBackupId === backupId &&
      localBackup.draftKey === snapshot.draftKey &&
      localBackup.choice === choice &&
      equal(localBackup.local, snapshot.local) &&
      equal(localBackup.server, snapshot.server) &&
      equal(
        localBackup.context,
        snapshot.context
      ),
      "LOCAL_BACKUP_REQUIRED"
    );

    assert(
      localBackup.cloudVerified === true &&
      localBackup.backupStatus ===
        "CLOUD_BACKUP_VERIFIED" &&
      equal(
        localBackup.cloudReceipt,
        firstReceipt
      ),
      "VERIFIED_LOCAL_RECEIPT_REQUIRED"
    );

    const savedPhotos =
      localBackup.serverPhotos || {};

    const expectedPhotos =
      snapshot.serverPhotos || {};

    assert(
      equal(
        Object.keys(savedPhotos).sort(),
        Object.keys(expectedPhotos).sort()
      ),
      "LOCAL_BACKUP_PHOTO_SET_MISMATCH"
    );

    for (const id of Object.keys(expectedPhotos)) {

      assert(
        savedPhotos[id].data ===
          expectedPhotos[id].data &&
        savedPhotos[id].fileId ===
          snapshot.server.photos[id].fileId,
        "LOCAL_BACKUP_PHOTO_MISMATCH"
      );

    }

    assertCloudReceipt(

      firstReceipt,

      snapshot,

      choice,

      backupId

    );

    assertCloudReceipt(

      finalReceipt,

      snapshot,

      choice,

      backupId

    );

    assertSameReceipt(

      firstReceipt,

      finalReceipt

    );

    return true;

  }

  /* =====================================================
     13. XỬ LÝ XUNG ĐỘT

     Không gọi Web Lock lồng nhau.
     Không có đường xử lý bỏ qua Cloud Backup.
  ===================================================== */

  function resolveConflict(

    context,

    previewId,

    choice,

    confirmed,

    options

  ) {

    requireModules();

    validateChoice(choice);

    assert(
      confirmed === true,
      "CONFIRMATION_REQUIRED",
      "Cần xác nhận lựa chọn."
    );

    const safeContext = clone(context);

    options = options || {};

    const onProgress = options.onProgress;

    assertSession(safeContext);

    assertOnline();

    return PGDCloudBackup.withSession(

      safeContext,

      async function(token) {

        const key = keyOf(safeContext);

        let backupId = null;

        let committed = false;

        let stage = "PREVIEW_CHECK";

        try {

          notify(onProgress, stage);

          const prepared = previews.get(key);

          assert(
            prepared &&
            prepared.previewId === previewId,
            "PREVIEW_REQUIRED",
            "Cần so sánh lại trước khi xử lý."
          );

          const snapshot =
            await PGDCloudBackup.captureInSession(
              token
            );

          validateSnapshot(snapshot);

          assert(
            equal(prepared.snapshot, snapshot),
            "PREVIEW_EXPIRED",
            "Dữ liệu đã thay đổi. Cần so sánh lại."
          );

          backupId = PGDDraft.createId();

          /* ---------------------------------------------
             A. Sao lưu IndexedDB
          --------------------------------------------- */

          stage = "LOCAL_BACKUP";

          notify(onProgress, stage, {

            backupId: backupId

          });

          let localBackup =
            await saveBackup(

              createBackupRecord(

                snapshot,

                choice,

                backupId

              )

            );

          /* ---------------------------------------------
             B. Sao lưu Google Drive
          --------------------------------------------- */

          stage = "CLOUD_BACKUP";

          notify(onProgress, stage, {

            backupId: backupId

          });

          const firstReceipt =
            await PGDCloudBackup.backupInSession(

              token,

              snapshot,

              choice,

              {

                backupId: backupId,

                onProgress: function(progress) {

                  notify(

                    onProgress,

                    "CLOUD_PROGRESS",

                    progress

                  );

                }

              }

            );

          assertCloudReceipt(

            firstReceipt,

            snapshot,

            choice,

            backupId

          );

          await verifySnapshotHashes(

            firstReceipt,

            snapshot

          );

          /* ---------------------------------------------
             C. Lưu biên nhận vào IndexedDB
          --------------------------------------------- */

          stage = "SAVE_CLOUD_RECEIPT";

          notify(onProgress, stage);

          const verifiedBackup = {

            ...clone(localBackup),

            cloudVerified: true,

            cloudReceipt: clone(firstReceipt),

            backupStatus: "CLOUD_BACKUP_VERIFIED",

            cloudVerifiedAt:
              new Date().toISOString()

          };

          localBackup = await updateBackup(

            localBackup,

            verifiedBackup

          );

          /* ---------------------------------------------
             D. Chuẩn bị bản ghi mới
          --------------------------------------------- */

          const replacement = buildRecord(

            snapshot,

            choice

          );

          /* ---------------------------------------------
             E. Xác minh độc lập lần cuối
          --------------------------------------------- */

          stage = "FINAL_VERIFICATION";

          notify(onProgress, stage);

          const finalReceipt =
            await PGDCloudBackup.verifyInSession(

              token,

              snapshot,

              choice,

              backupId

            );

          assertCommitGate(

            localBackup,

            firstReceipt,

            finalReceipt,

            snapshot,

            choice,

            backupId

          );

          /* ---------------------------------------------
             F. Lưu biên nhận cuối
          --------------------------------------------- */

          const finalBackup = {

            ...clone(localBackup),

            finalReceipt: clone(finalReceipt),

            backupStatus: "READY_FOR_LOCAL_COMMIT",

            finalVerifiedAt:
              new Date().toISOString()

          };

          localBackup = await updateBackup(

            localBackup,

            finalBackup

          );

          /* ---------------------------------------------
             G. Kiểm tra lần cuối
          --------------------------------------------- */

          stage = "PRE_COMMIT_CHECK";

          notify(onProgress, stage);

          await assertCurrent(snapshot);

          assertSession(safeContext);

          assertOnline();

          /* ---------------------------------------------
             H. Ghi bản nháp
          --------------------------------------------- */

          stage = "LOCAL_COMMIT";

          notify(onProgress, stage);

          await replaceLocal(

            safeContext,

            snapshot.local,

            replacement

          );

          committed = true;

          previews.delete(key);

          /* ---------------------------------------------
             I. Cập nhật trạng thái bản sao lưu

             Nếu cập nhật metadata thất bại sau commit,
             không báo nhầm rằng bản nháp chưa thay đổi.
          --------------------------------------------- */

          let backupMetadataUpdated = false;

          let warning = null;

          try {

            const completedBackup = {

              ...clone(localBackup),

              backupStatus: "LOCAL_COMMIT_COMPLETED",

              resolvedAt:
                new Date().toISOString(),

              resolvedLocalRevision:
                replacement.localRevision

            };

            await updateBackup(

              localBackup,

              completedBackup

            );

            backupMetadataUpdated = true;

          } catch (error) {

            warning =

              "Bản nháp đã cập nhật, nhưng chưa " +

              "cập nhật được trạng thái cuối " +

              "của bản sao lưu: " +

              error.message;

          }

          notify(onProgress, "COMPLETED", {

            backupId: backupId

          });

          return {

            success: true,

            choice: choice,

            backupId: backupId,

            backupVerified: true,

            localBackupVerified: true,

            cloudBackupId: backupId,

            cloudBackupVerified: true,

            contentVerified: true,

            finalVerificationPassed: true,

            localCommitted: true,

            backupMetadataUpdated:
              backupMetadataUpdated,

            warning: warning,

            serverVersion:
              replacement.serverVersion,

            localRevision:
              replacement.localRevision,

            dirty: replacement.dirty,

            serverWritten: false,

            nextAction:
              choice === "KEEP_LOCAL"
                ? "SYNC_REQUIRED"
                : "SERVER_RESTORED"

          };

        } catch (error) {

          previews.delete(key);

          error.backupId = backupId;

          error.resolutionStage = stage;

          error.localCommitted = committed;

          throw error;

        }

      }

    );

  }

  /* =====================================================
     14. KIỂM THỬ LOGIC

     28 bài kiểm thử cũ.
     16 bài kiểm thử bổ sung.
     Không ghi Google Drive.
     Không ghi IndexedDB.
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

    function rejects(callback, code) {

      try {

        callback();

        return false;

      } catch (error) {

        return !code || error.code === code;

      }

    }

    const local = {

      serverVersion: 1,

      localRevision: 5,

      status: "DRAFT",

      dirty: true,

      catalogRevision: "751",

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

      success: true,

      exists: true,

      version: 2,

      status: "DRAFT",

      catalogRevision: "751",

      data: {

        generalNote: "SERVER"

      },

      photos: {

        HA001: {

          fileId: "FILE_B"

        },

        HA002: {

          fileId: "FILE_C"

        }

      }

    };

    const snapshot = {

      context: {

        date: "2026-12-17",

        branch: "CS1",

        shift: "SANG",

        department: "BEP_PHO",

        employee: "TEST_API01"

      },

      draftKey:
        "20261217-CS1-SANG-BEP_PHO-TEST_API01",

      local: local,

      server: server,

      serverPhotos: {

        HA001: {

          data: "IMAGE_B"

        },

        HA002: {

          data: "IMAGE_C"

        }

      }

    };

    /* 28 bài kiểm thử cũ */

    test("01. Phiên bản module", () =>

      CONFIG.VERSION === "7.8.4.3-C2.3-C2"

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

    test("18. Bản thiết bị cần đồng bộ", () =>

      buildRecord(

        snapshot,

        "KEEP_LOCAL"

      ).dirty === true

    );

    test("19. Bản máy chủ đánh dấu sạch", () =>

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

      const before = canonical(snapshot);

      buildRecord(snapshot, "KEEP_LOCAL");

      buildRecord(snapshot, "KEEP_SERVER");

      return before === canonical(snapshot);

    });

    test("26. Chặn lựa chọn không hợp lệ", () =>

      rejects(

        () => buildRecord(snapshot, "UNKNOWN"),

        "INVALID_CHOICE"

      )

    );

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

    /* 16 bài kiểm thử mới */

    const backupId =
      "TEST_BACKUP_123456789";

    const choice = "KEEP_LOCAL";

    function makeReceipt() {

      const receipt = {

        success: true,

        status: "VERIFIED",

        backupId: backupId,

        draftKey: snapshot.draftKey,

        choice: choice,

        localVersion: 1,

        localRevision: 5,

        serverVersion: 2,

        localHash: "a".repeat(64),

        serverHash: "b".repeat(64),

        localPhotoHashes: {

          HA001: "c".repeat(64)

        },

        serverPhotoHashes: {

          HA001: "d".repeat(64),

          HA002: "e".repeat(64)

        },

        contentVerified: true,

        resolutionAuthorized: false,

        businessDataWritten: false

      };

      receipt.confirmation = {

        success: true,

        status: "VERIFIED",

        verificationVersion:
          CONFIG.VERIFY_VERSION,

        catalogRevision: "751",

        backupId: backupId,

        draftId: snapshot.draftKey,

        choice: choice,

        localVersion: 1,

        localRevision: 5,

        serverVersion: 2,

        localHash: receipt.localHash,

        serverHash: receipt.serverHash,

        localPhotoHashes:
          clone(receipt.localPhotoHashes),

        serverPhotoHashes:
          clone(receipt.serverPhotoHashes),

        localPhotoCount: 1,

        serverPhotoCount: 2,

        contentVerified: true,

        serverWritten: false,

        businessDataWritten: false,

        resolutionAuthorized: false,

        resolutionIntegrated: false

      };

      return receipt;

    }

    function checkReceipt(receipt) {

      return assertCloudReceipt(

        receipt,

        snapshot,

        choice,

        backupId

      );

    }

    function makeVerifiedBackup() {

      const backup = createBackupRecord(

        snapshot,

        choice,

        backupId

      );

      backup.cloudVerified = true;

      backup.cloudReceipt = makeReceipt();

      backup.backupStatus =
        "CLOUD_BACKUP_VERIFIED";

      return backup;

    }

    test("29. Cloud Backup version", () =>

      CONFIG.CLOUD_BACKUP_VERSION ===
        "7.8.4.3-C2.3-C1"

    );

    test("30. Chặn thiếu biên nhận Cloud", () =>

      rejects(

        () => checkReceipt(null),

        "CLOUD_BACKUP_NOT_VERIFIED"

      )

    );

    test("31. Chấp nhận biên nhận hợp lệ", () =>

      checkReceipt(makeReceipt())

    );

    test("32. Chặn Cloud chưa xác minh", () => {

      const receipt = makeReceipt();

      receipt.contentVerified = false;

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_BACKUP_NOT_VERIFIED"

      );

    });

    test("33. Chặn sai Backup ID", () => {

      const receipt = makeReceipt();

      receipt.backupId = "OTHER_BACKUP";

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_BACKUP_ID_MISMATCH"

      );

    });

    test("34. Chặn sai bản nháp", () => {

      const receipt = makeReceipt();

      receipt.draftKey = "OTHER_DRAFT";

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_DRAFT_KEY_MISMATCH"

      );

    });

    test("35. Chặn sai lựa chọn", () => {

      const receipt = makeReceipt();

      receipt.choice = "KEEP_SERVER";

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_CHOICE_MISMATCH"

      );

    });

    test("36. Chặn localRevision thay đổi", () => {

      const receipt = makeReceipt();

      receipt.localRevision++;

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_VERSION_MISMATCH"

      );

    });

    test("37. Chặn serverVersion thay đổi", () => {

      const receipt = makeReceipt();

      receipt.serverVersion++;

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_VERSION_MISMATCH"

      );

    });

    test("38. Chặn SHA-256 không hợp lệ", () => {

      const receipt = makeReceipt();

      receipt.localHash = "INVALID";

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_HASH_INVALID"

      );

    });

    test("39. Chặn thiếu ảnh trong biên nhận", () => {

      const receipt = makeReceipt();

      delete receipt.serverPhotoHashes.HA002;

      return rejects(

        () => checkReceipt(receipt),

        "CLOUD_PHOTO_SET_MISMATCH"

      );

    });

    test("40. Chặn thiếu xác minh độc lập", () => {

      const receipt = makeReceipt();

      receipt.confirmation = null;

      return rejects(

        () => checkReceipt(receipt),

        "INDEPENDENT_VERIFICATION_REQUIRED"

      );

    });

    test("41. Chặn biên nhận cuối sai hash", () => {

      const first = makeReceipt();

      const final = makeReceipt();

      final.localHash = "f".repeat(64);

      return rejects(

        () => assertSameReceipt(first, final),

        "FINAL_RECEIPT_MISMATCH"

      );

    });

    test("42. Chặn thiếu sao lưu IndexedDB", () =>

      rejects(

        () => assertCommitGate(

          null,

          makeReceipt(),

          makeReceipt(),

          snapshot,

          choice,

          backupId

        ),

        "LOCAL_BACKUP_REQUIRED"

      )

    );

    test("43. Chặn thiếu biên nhận cuối", () =>

      rejects(

        () => assertCommitGate(

          makeVerifiedBackup(),

          makeReceipt(),

          null,

          snapshot,

          choice,

          backupId

        ),

        "CLOUD_BACKUP_NOT_VERIFIED"

      )

    );

    test("44. Cổng kiểm tra đầy đủ", () =>

      assertCommitGate(

        makeVerifiedBackup(),

        makeReceipt(),

        makeReceipt(),

        snapshot,

        choice,

        backupId

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

  /* =====================================================
     15. PUBLIC MODULE
  ===================================================== */

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
 * END OF CONFLICT-RESOLUTION.JS
 * VERSION: 7.8.4.3-C2.3-C2
 ************************************************************/
