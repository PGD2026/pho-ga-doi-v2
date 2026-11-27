
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: conflict-resolution.js
 * VERSION: 7.8.4.3-C3.2
 *
 * IndexedDB + Google Drive Backup
 * Independent Content Verification
 * Conditional Sync Release
 * Multi-tab Web Locks
 * TEST MODE ONLY
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.3-C3.2",
    CATALOG_REVISION: "751",
    CLOUD_BACKUP_VERSION: "7.8.4.3-C2.3-C1",
    SYNC_VERSION: "7.8.4.3-C3.1",
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
  const resolving = new Map();
  const releasing = new Map();

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
      // Lỗi giao diện không thay đổi dữ liệu.
    }

  }

  /* =====================================================
     02. MODULE VÀ PHIÊN ĐĂNG NHẬP
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
      "Chưa tải module Cloud Backup."
    );

    assert(
      PGDCloudBackup.config.VERSION ===
        CONFIG.CLOUD_BACKUP_VERSION,
      "CLOUD_BACKUP_VERSION_MISMATCH",
      "Phiên bản Cloud Backup không tương thích."
    );

    assert(
      PGDSync.config.VERSION ===
        CONFIG.SYNC_VERSION,
      "SYNC_VERSION_MISMATCH",
      "Cần sử dụng sync.js C3.1."
    );

    assert(
      typeof PGDSync.releaseAfterResolution ===
        "function",
      "SYNC_RELEASE_REQUIRED",
      "Thiếu hàm giải phóng trạng thái chặn."
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
            fail("BACKUP_FAILED")
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
      saved && equal(saved, replacement),
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

      localVersion:
        record.local.serverVersion,

      serverVersion:
        record.server.version,

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
        record.backupStatus ||
        "LEGACY_LOCAL_ONLY",

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

      Number.isSafeInteger(
        local.serverVersion
      ) &&

      Number.isSafeInteger(
        local.localRevision
      ) &&

      Number.isSafeInteger(
        server.version
      ) &&

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
      snapshot.draftKey ===
        keyOf(snapshot.context),
      "DRAFT_KEY_MISMATCH"
    );

    return true;

  }

  /* =====================================================
     05. CHUẨN HÓA ẢNH MÁY CHỦ
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
     07. CHUẨN BỊ BẢN GHI
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
        Object.keys(server.photos || {})
          .filter(id => !record.photos[id]);

      Object.keys(record.photos).forEach(id => {

        const photo = record.photos[id];
        const remote = remotePhotos[id];

        if (
          remote &&
          remote.data === photo.data
        ) {

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

      confirmation.localHash ===
        receipt.localHash &&

      confirmation.serverHash ===
        receipt.serverHash &&

      equal(
        confirmation.localPhotoHashes,
        receipt.localPhotoHashes
      ) &&

      equal(
        confirmation.serverPhotoHashes,
        receipt.serverPhotoHashes
      ) &&

      confirmation.localPhotoCount ===
        Object.keys(
          receipt.localPhotoHashes
        ).length &&

      confirmation.serverPhotoCount ===
        Object.keys(
          receipt.serverPhotoHashes
        ).length &&

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
     09. KIỂM TRA TRƯỚC KHI GHI
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
     10. GHI INDEXEDDB CÓ ĐIỀU KIỆN
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

      backupStatus:
        "LOCAL_BACKUP_SAVED"

    };

  }

  /* =====================================================
     12. CỔNG KIỂM TRA CUỐI
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

      equal(
        localBackup.local,
        snapshot.local
      ) &&

      equal(
        localBackup.server,
        snapshot.server
      ) &&

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
     13. C3.2 - ĐIỀU KIỆN GIẢI PHÓNG CHẶN
  ===================================================== */

  function canAttemptRelease(result) {

    return Boolean(

      result &&
      result.success === true &&
      result.localCommitted === true &&
      result.backupMetadataUpdated === true &&
      result.backupVerified === true &&
      result.localBackupVerified === true &&
      result.cloudBackupVerified === true &&
      result.contentVerified === true &&
      result.finalVerificationPassed === true &&
      result.serverWritten === false &&

      typeof result.backupId === "string" &&
      result.backupId.length > 0 &&

      result.cloudBackupId ===
        result.backupId &&

      CONFIG.CHOICES.includes(
        result.choice
      )

    );

  }

  function assertReleaseResult(
    released,
    expected
  ) {

    assert(

      released &&
      released.success === true &&
      released.status === "RELEASED" &&

      released.backupId ===
        expected.backupId &&

      released.choice ===
        expected.choice &&

      released.serverVersion ===
        expected.serverVersion &&

      released.dirty ===
        expected.dirty &&

      released.serverWritten === false,

      "SYNC_RELEASE_NOT_VERIFIED",
      "Chưa xác nhận được kết quả mở chặn."

    );

    return true;

  }

  function releaseSuccess(result, released) {

    assertReleaseResult(
      released,
      result
    );

    return {

      ...result,

      syncReleaseAttempted: true,
      syncReleased: true,
      syncReleaseStatus: "RELEASED",
      syncReleaseError: null,
      syncReleaseReceipt: clone(released),

      nextAction:
        result.choice === "KEEP_LOCAL"
          ? "SYNC_REQUIRED"
          : "SERVER_RESTORED"

    };

  }

  function releaseFailure(
    result,
    error,
    attempted
  ) {

    const message =
      error && error.message
        ? error.message
        : "Chưa giải phóng được trạng thái chặn.";

    const warning = [

      result.warning,

      "Bản nháp đã được xử lý và sao lưu. " +
      "Chưa xác nhận mở chặn đồng bộ: " +
      message

    ].filter(Boolean).join(" | ");

    return {

      ...result,

      success: true,
      localCommitted: true,

      syncReleaseAttempted:
        attempted === true,

      syncReleased: false,

      syncReleaseStatus:
        attempted === true
          ? "RELEASE_FAILED"
          : "RELEASE_SKIPPED",

      syncReleaseError: {

        code:
          error && error.code
            ? error.code
            : "SYNC_RELEASE_FAILED",

        message: message

      },

      syncReleaseReceipt: null,

      warning: warning,

      nextAction: "RETRY_RELEASE_REQUIRED"

    };

  }

  /* =====================================================
     14. C3.2 - MỞ CHẶN SAU KHI WEB LOCK KẾT THÚC

     Hàm này không được gọi từ bên trong
     PGDCloudBackup.withSession().
  ===================================================== */

  async function releaseAfterCommit(
    context,
    result,
    onProgress
  ) {

    if (!canAttemptRelease(result)) {

      return releaseFailure(
        result,
        fail(
          "RELEASE_GATE_FAILED",
          "Chưa đủ điều kiện giải phóng chặn."
        ),
        false
      );

    }

    notify(
      onProgress,
      "SYNC_RELEASE_STARTED",
      {
        backupId: result.backupId
      }
    );

    try {

      assertSession(context);
      assertOnline();

      const released =
        await PGDSync.releaseAfterResolution(
          context,
          result.backupId
        );

      const finalResult =
        releaseSuccess(
          result,
          released
        );

      notify(
        onProgress,
        "SYNC_RELEASE_COMPLETED",
        {
          backupId: result.backupId,
          choice: result.choice,
          serverVersion: result.serverVersion
        }
      );

      return finalResult;

    } catch (error) {

      notify(
        onProgress,
        "SYNC_RELEASE_FAILED",
        {
          backupId: result.backupId,
          code: error.code || "SYNC_RELEASE_FAILED",
          message: error.message
        }
      );

      return releaseFailure(
        result,
        error,
        true
      );

    }

  }

  /* =====================================================
     15. XỬ LÝ XUNG ĐỘT TRONG WEB LOCK
  ===================================================== */

  function resolveInsideSession(
    context,
    previewId,
    choice,
    onProgress
  ) {

    return PGDCloudBackup.withSession(

      context,

      async function(token) {

        const key = keyOf(context);

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
            "Dữ liệu đã thay đổi."
          );

          backupId = PGDDraft.createId();

          /* A. Sao lưu IndexedDB */

          stage = "LOCAL_BACKUP";

          notify(
            onProgress,
            stage,
            {backupId: backupId}
          );

          let localBackup =
            await saveBackup(
              createBackupRecord(
                snapshot,
                choice,
                backupId
              )
            );

          /* B. Sao lưu Google Drive */

          stage = "CLOUD_BACKUP";

          notify(
            onProgress,
            stage,
            {backupId: backupId}
          );

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

          /* C. Lưu biên nhận */

          stage = "SAVE_CLOUD_RECEIPT";

          notify(onProgress, stage);

          const verifiedBackup = {

            ...clone(localBackup),

            cloudVerified: true,

            cloudReceipt:
              clone(firstReceipt),

            backupStatus:
              "CLOUD_BACKUP_VERIFIED",

            cloudVerifiedAt:
              new Date().toISOString()

          };

          localBackup = await updateBackup(
            localBackup,
            verifiedBackup
          );

          /* D. Chuẩn bị bản ghi mới */

          const replacement = buildRecord(
            snapshot,
            choice
          );

          /* E. Xác minh độc lập lần cuối */

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

          /* F. Lưu biên nhận cuối */

          const finalBackup = {

            ...clone(localBackup),

            finalReceipt:
              clone(finalReceipt),

            backupStatus:
              "READY_FOR_LOCAL_COMMIT",

            finalVerifiedAt:
              new Date().toISOString()

          };

          localBackup = await updateBackup(
            localBackup,
            finalBackup
          );

          /* G. Kiểm tra trước commit */

          stage = "PRE_COMMIT_CHECK";

          notify(onProgress, stage);

          await assertCurrent(snapshot);

          assertSession(context);
          assertOnline();

          /* H. Ghi bản nháp */

          stage = "LOCAL_COMMIT";

          notify(onProgress, stage);

          await replaceLocal(
            context,
            snapshot.local,
            replacement
          );

          committed = true;

          previews.delete(key);

          /* I. Cập nhật metadata */

          let backupMetadataUpdated = false;
          let warning = null;

          try {

            const completedBackup = {

              ...clone(localBackup),

              backupStatus:
                "LOCAL_COMMIT_COMPLETED",

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
              "cập nhật được metadata bản sao lưu: " +
              error.message;

          }

          notify(
            onProgress,
            "LOCAL_COMMIT_COMPLETED",
            {backupId: backupId}
          );

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

            dirty:
              replacement.dirty,

            serverWritten: false,

            syncReleaseAttempted: false,
            syncReleased: false,
            syncReleaseStatus: "PENDING",

            nextAction:
              "SYNC_RELEASE_REQUIRED"

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
     16. PUBLIC RESOLVE

     C3.2:
     1. Xử lý trong Web Lock.
     2. Chờ Web Lock kết thúc.
     3. Mở chặn bằng Web Lock mới.
     4. Không tự gọi syncNow().
  ===================================================== */

  async function runResolution(
    context,
    previewId,
    choice,
    onProgress
  ) {

    const result =
      await resolveInsideSession(
        context,
        previewId,
        choice,
        onProgress
      );

    // withSession đã hoàn tất.
    // Không còn giữ Web Lock cũ.

    notify(
      onProgress,
      "WEB_LOCK_RELEASED",
      {
        backupId: result.backupId
      }
    );

    const finalResult =
      await releaseAfterCommit(
        context,
        result,
        onProgress
      );

    notify(
      onProgress,
      "COMPLETED",
      {
        backupId: result.backupId,
        localCommitted: true,
        syncReleased: finalResult.syncReleased
      }
    );

    return finalResult;

  }

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

    assertSession(safeContext);
    assertOnline();

    const key = keyOf(safeContext);

    assert(
      !resolving.has(key) &&
      !releasing.has(key),
      "RESOLUTION_BUSY",
      "Bản nháp đang được xử lý."
    );

    const task = Promise.resolve()

      .then(() =>
        runResolution(
          safeContext,
          previewId,
          choice,
          options.onProgress
        )
      )

      .finally(() => {
        resolving.delete(key);
      });

    resolving.set(key, task);

    return task;

  }

  /* =====================================================
     17. C3.2 - THỬ LẠI MỞ CHẶN

     Không xử lý lại xung đột.
     Không tạo bản sao lưu mới.
     Không thay đổi nội dung bản nháp.
  ===================================================== */

  function assertRetryBackup(
    backup,
    context,
    backupId
  ) {

    assert(

      backup &&
      backup.backupId === backupId &&
      backup.cloudBackupId === backupId &&
      backup.draftKey === keyOf(context) &&
      equal(backup.context, context) &&

      backup.backupStatus ===
        "LOCAL_COMMIT_COMPLETED" &&

      backup.cloudVerified === true &&

      backup.local &&
      backup.server &&
      backup.cloudReceipt &&
      backup.finalReceipt &&

      backup.finalReceipt.contentVerified === true &&

      Number.isSafeInteger(
        backup.resolvedLocalRevision
      ) &&

      backup.resolvedLocalRevision ===
        backup.local.localRevision + 1,

      "RETRY_BACKUP_NOT_READY",
      "Bản sao lưu chưa đủ điều kiện mở chặn."

    );

    validateChoice(backup.choice);

    const snapshot = {

      context: backup.context,
      draftKey: backup.draftKey,
      local: backup.local,
      server: backup.server,
      serverPhotos: backup.serverPhotos

    };

    assertCloudReceipt(
      backup.cloudReceipt,
      snapshot,
      backup.choice,
      backupId
    );

    assertCloudReceipt(
      backup.finalReceipt,
      snapshot,
      backup.choice,
      backupId
    );

    assertSameReceipt(
      backup.cloudReceipt,
      backup.finalReceipt
    );

    return true;

  }

  async function runRetryRelease(
    context,
    backupId,
    onProgress
  ) {

    assertSession(context);
    assertOnline();

    const backup = await getBackup(
      context,
      backupId
    );

    assertRetryBackup(
      backup,
      context,
      backupId
    );

    const result = {

      success: true,

      choice: backup.choice,
      backupId: backupId,

      backupVerified: true,
      localBackupVerified: true,

      cloudBackupId: backupId,
      cloudBackupVerified: true,

      contentVerified: true,
      finalVerificationPassed: true,
      localCommitted: true,
      backupMetadataUpdated: true,

      warning: null,

      serverVersion:
        backup.server.version,

      localRevision:
        backup.resolvedLocalRevision,

      dirty:
        backup.choice === "KEEP_LOCAL",

      serverWritten: false,

      retryOnly: true

    };

    return releaseAfterCommit(
      context,
      result,
      onProgress
    );

  }

  function retryRelease(
    context,
    backupId,
    options
  ) {

    requireModules();

    const safeContext = clone(context);

    assertSession(safeContext);
    assertOnline();

    assert(
      typeof backupId === "string" &&
      backupId.length > 0,
      "BACKUP_ID_REQUIRED"
    );

    const key = keyOf(safeContext);

    assert(
      !resolving.has(key) &&
      !releasing.has(key),
      "RESOLUTION_BUSY",
      "Bản nháp đang được xử lý."
    );

    options = options || {};

    const task = Promise.resolve()

      .then(() =>
        runRetryRelease(
          safeContext,
          backupId,
          options.onProgress
        )
      )

      .finally(() => {
        releasing.delete(key);
      });

    releasing.set(key, task);

    return task;

  }

  /* =====================================================
     18. KIỂM TRA TRẠNG THÁI MODULE
  ===================================================== */

  function getResolutionStatus(context) {

    assertSession(context);

    const key = keyOf(context);

    return {

      version: CONFIG.VERSION,

      resolving:
        resolving.has(key),

      releasing:
        releasing.has(key),

      previewAvailable:
        previews.has(key),

      syncReleaseSupported:
        Boolean(
          global.PGDSync &&
          typeof PGDSync.releaseAfterResolution
            === "function"
        )

    };

  }

  /* =====================================================
     19. 44 BÀI KIỂM THỬ HỒI QUY
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

        return !code ||
          error.code === code;

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

    test("01. Phiên bản module", () =>
      CONFIG.VERSION === "7.8.4.3-C3.2"
    );

    test("02. Danh mục 751", () =>
      CONFIG.CATALOG_REVISION === "751"
    );

    test("03. Xung đột hợp lệ", () =>
      canResolve(local, server, null)
    );

    test("04. Chặn Outbox", () =>
      !canResolve(local, server, {})
    );

    test("05. Chặn SUBMITTED", () =>
      !canResolve(
        local,
        {...server, status: "SUBMITTED"},
        null
      )
    );

    test("06. Chặn APPROVED", () =>
      !canResolve(
        local,
        {...server, status: "APPROVED"},
        null
      )
    );

    test("07. Chặn FINALIZED", () =>
      !canResolve(
        local,
        {...server, status: "FINALIZED"},
        null
      )
    );

    test("08. Chặn thiết bị khóa", () =>
      !canResolve(
        {...local, status: "APPROVED"},
        server,
        null
      )
    );

    test("09. Thiếu bản nháp", () =>
      !canResolve(null, server, null)
    );

    test("10. Máy chủ không tồn tại", () =>
      !canResolve(
        local,
        {...server, exists: false},
        null
      )
    );

    test("11. Phiên bản giống nhau", () =>
      !canResolve(
        local,
        {...server, version: 1},
        null
      )
    );

    test("12. Phiên bản bất thường", () =>
      !canResolve(
        local,
        {...server, version: 0},
        null
      )
    );

    test("13. Bản nháp sạch", () =>
      !canResolve(
        {...local, dirty: false},
        server,
        null
      )
    );

    test("14. Giữ ghi chú local", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).data.generalNote === "LOCAL"
    );

    test("15. Giữ ghi chú server", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).data.generalNote === "SERVER"
    );

    test("16. Cập nhật serverVersion", () =>
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

    test("18. KEEP_LOCAL dirty", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).dirty === true
    );

    test("19. KEEP_SERVER clean", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).dirty === false
    );

    test("20. Giữ ảnh local", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).photos.HA001.data === "IMAGE_A"
    );

    test("21. Giữ ảnh server", () =>
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

    test("23. Ghi nhận ảnh cần xóa", () =>
      buildRecord(
        snapshot,
        "KEEP_LOCAL"
      ).removedPhotos.includes("HA002")
    );

    test("24. Server không có ảnh chờ xóa", () =>
      buildRecord(
        snapshot,
        "KEEP_SERVER"
      ).removedPhotos.length === 0
    );

    test("25. Bảo toàn snapshot", () => {

      const before = canonical(snapshot);

      buildRecord(snapshot, "KEEP_LOCAL");
      buildRecord(snapshot, "KEEP_SERVER");

      return before === canonical(snapshot);

    });

    test("26. Lựa chọn không hợp lệ", () =>
      rejects(
        () => buildRecord(snapshot, "UNKNOWN"),
        "INVALID_CHOICE"
      )
    );

    test("27. Giữ REJECTED", () =>
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

    test("28. Phát hiện thay đổi", () =>
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

    test("30. Thiếu biên nhận", () =>
      rejects(
        () => checkReceipt(null),
        "CLOUD_BACKUP_NOT_VERIFIED"
      )
    );

    test("31. Biên nhận hợp lệ", () =>
      checkReceipt(makeReceipt())
    );

    test("32. Cloud chưa xác minh", () => {

      const receipt = makeReceipt();

      receipt.contentVerified = false;

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_BACKUP_NOT_VERIFIED"
      );

    });

    test("33. Sai Backup ID", () => {

      const receipt = makeReceipt();

      receipt.backupId = "OTHER_BACKUP";

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_BACKUP_ID_MISMATCH"
      );

    });

    test("34. Sai bản nháp", () => {

      const receipt = makeReceipt();

      receipt.draftKey = "OTHER_DRAFT";

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_DRAFT_KEY_MISMATCH"
      );

    });

    test("35. Sai lựa chọn", () => {

      const receipt = makeReceipt();

      receipt.choice = "KEEP_SERVER";

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_CHOICE_MISMATCH"
      );

    });

    test("36. Sai localRevision", () => {

      const receipt = makeReceipt();

      receipt.localRevision++;

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_VERSION_MISMATCH"
      );

    });

    test("37. Sai serverVersion", () => {

      const receipt = makeReceipt();

      receipt.serverVersion++;

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_VERSION_MISMATCH"
      );

    });

    test("38. SHA-256 không hợp lệ", () => {

      const receipt = makeReceipt();

      receipt.localHash = "INVALID";

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_HASH_INVALID"
      );

    });

    test("39. Thiếu ảnh trong biên nhận", () => {

      const receipt = makeReceipt();

      delete receipt.serverPhotoHashes.HA002;

      return rejects(
        () => checkReceipt(receipt),
        "CLOUD_PHOTO_SET_MISMATCH"
      );

    });

    test("40. Thiếu xác minh độc lập", () => {

      const receipt = makeReceipt();

      receipt.confirmation = null;

      return rejects(
        () => checkReceipt(receipt),
        "INDEPENDENT_VERIFICATION_REQUIRED"
      );

    });

    test("41. Biên nhận cuối sai hash", () => {

      const first = makeReceipt();
      const final = makeReceipt();

      final.localHash = "f".repeat(64);

      return rejects(
        () => assertSameReceipt(first, final),
        "FINAL_RECEIPT_MISMATCH"
      );

    });

    test("42. Thiếu sao lưu IndexedDB", () =>
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

    test("43. Thiếu biên nhận cuối", () =>
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
     20. C3.2 - 10 BÀI KIỂM THỬ BỔ SUNG

     Chỉ kiểm thử logic.
     Không ghi Google Drive.
     Không ghi IndexedDB.
     Không gửi yêu cầu đồng bộ.
  ===================================================== */

  function selfTestC32() {

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

    function makeResult(choice) {

      return {

        success: true,

        choice: choice,

        backupId: "TEST_BACKUP_C32",
        cloudBackupId: "TEST_BACKUP_C32",

        backupVerified: true,
        localBackupVerified: true,
        cloudBackupVerified: true,
        contentVerified: true,
        finalVerificationPassed: true,

        localCommitted: true,
        backupMetadataUpdated: true,

        serverVersion: 2,
        localRevision: 6,

        dirty:
          choice === "KEEP_LOCAL",

        serverWritten: false,

        warning: null

      };

    }

    function makeRelease(choice) {

      return {

        success: true,
        status: "RELEASED",
        backupId: "TEST_BACKUP_C32",
        choice: choice,
        serverVersion: 2,

        dirty:
          choice === "KEEP_LOCAL",

        serverWritten: false

      };

    }

    test("01. Tương thích sync.js C3.1", () =>
      CONFIG.SYNC_VERSION === "7.8.4.3-C3.1"
    );

    test("02. KEEP_LOCAL đủ điều kiện", () =>
      canAttemptRelease(
        makeResult("KEEP_LOCAL")
      )
    );

    test("03. KEEP_SERVER đủ điều kiện", () =>
      canAttemptRelease(
        makeResult("KEEP_SERVER")
      )
    );

    test("04. Chặn khi chưa commit", () =>
      !canAttemptRelease({
        ...makeResult("KEEP_LOCAL"),
        localCommitted: false
      })
    );

    test("05. Chặn thiếu metadata", () =>
      !canAttemptRelease({
        ...makeResult("KEEP_LOCAL"),
        backupMetadataUpdated: false
      })
    );

    test("06. Chặn Cloud chưa xác minh", () =>
      !canAttemptRelease({
        ...makeResult("KEEP_LOCAL"),
        cloudBackupVerified: false
      })
    );

    test("07. KEEP_LOCAL sau mở chặn", () => {

      const result = releaseSuccess(
        makeResult("KEEP_LOCAL"),
        makeRelease("KEEP_LOCAL")
      );

      return (
        result.syncReleased === true &&
        result.dirty === true &&
        result.serverWritten === false &&
        result.nextAction === "SYNC_REQUIRED"
      );

    });

    test("08. KEEP_SERVER sau mở chặn", () => {

      const result = releaseSuccess(
        makeResult("KEEP_SERVER"),
        makeRelease("KEEP_SERVER")
      );

      return (
        result.syncReleased === true &&
        result.dirty === false &&
        result.serverWritten === false &&
        result.nextAction === "SERVER_RESTORED"
      );

    });

    test("09. Mất mạng sau commit", () => {

      const result = releaseFailure(
        makeResult("KEEP_LOCAL"),
        fail("OFFLINE"),
        true
      );

      return (
        result.success === true &&
        result.localCommitted === true &&
        result.cloudBackupVerified === true &&
        result.syncReleased === false &&
        result.serverWritten === false &&
        result.nextAction ===
          "RETRY_RELEASE_REQUIRED"
      );

    });

    test("10. Từ chối biên nhận mở chặn sai", () => {

      try {

        releaseSuccess(
          makeResult("KEEP_LOCAL"),
          {
            ...makeRelease("KEEP_LOCAL"),
            backupId: "OTHER_BACKUP"
          }
        );

        return false;

      } catch (error) {

        return error.code ===
          "SYNC_RELEASE_NOT_VERIFIED";

      }

    });

    const passed = results.filter(
      item => item.passed
    ).length;

    return {

      success:
        passed === results.length,

      passed: passed,
      total: results.length,
      results: results

    };

  }

  /* =====================================================
     21. PUBLIC MODULE
  ===================================================== */

  global.PGDResolution = Object.freeze({

    config: CONFIG,

    preview: preview,

    resolveConflict: resolveConflict,

    retryRelease: retryRelease,

    getResolutionStatus:
      getResolutionStatus,

    listBackups: listBackups,

    getBackup: getBackup,

    selfTest: selfTest,

    selfTestC32: selfTestC32

  });

})(window);

/************************************************************
 * END OF CONFLICT-RESOLUTION.JS
 * VERSION: 7.8.4.3-C3.2
 ************************************************************/
