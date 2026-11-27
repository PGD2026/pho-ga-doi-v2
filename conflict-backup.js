
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: conflict-backup.js
 * VERSION: 7.8.4.3-C2.3-B
 *
 * Sao lưu xung đột lên Google Drive.
 * Không ghi đè dữ liệu nghiệp vụ.
 * Không tự xử lý xung đột.
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.3-C2.3-B",
    CATALOG_REVISION: "751",
    API_REVISION: "7.8.4.3-C2.3-A",
    VERIFY_VERSION: "7.8.4.3-C2.1",
    MAX_PHOTOS: 10,
    MAX_PHOTO_LENGTH: 750000,
    CHOICES: Object.freeze([
      "KEEP_LOCAL",
      "KEEP_SERVER"
    ]),
    EDITABLE: Object.freeze([
      "DRAFT",
      "REJECTED"
    ])
  });

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

  function isObject(value) {

    return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value);

  }

  /* =====================================================
     01. CHUẨN HÓA JSON
  ===================================================== */

  function canonical(value) {

    const normalized = clone(value);

    function serialize(item) {

      if (Array.isArray(item)) {

        return "[" +
          item.map(serialize).join(",") +
          "]";

      }

      if (isObject(item)) {

        return "{" +
          Object.keys(item)
            .sort()
            .map(function(key) {

              return JSON.stringify(key) +
                ":" +
                serialize(item[key]);

            })
            .join(",") +
          "}";

      }

      return JSON.stringify(item);

    }

    return serialize(normalized);

  }

  function equal(a, b) {

    return canonical(a) === canonical(b);

  }

  function validHash(hash) {

    return typeof hash === "string" &&
      /^[a-f0-9]{64}$/.test(hash);

  }

  /* =====================================================
     02. SHA-256
  ===================================================== */

  async function hashBytes(bytes) {

    assert(
      global.crypto &&
      global.crypto.subtle,
      "CRYPTO_UNAVAILABLE",
      "Trình duyệt không hỗ trợ SHA-256."
    );

    const digest = await global.crypto.subtle.digest(
      "SHA-256",
      bytes
    );

    return Array.from(
      new Uint8Array(digest)
    ).map(function(byte) {

      return byte.toString(16).padStart(2, "0");

    }).join("");

  }

  function hashText(text) {

    assert(
      typeof text === "string",
      "INVALID_HASH_TEXT"
    );

    return hashBytes(
      new TextEncoder().encode(text)
    );

  }

  function hashJson(value) {

    return hashText(canonical(value));

  }

  /* =====================================================
     03. KIỂM TRA HÌNH ẢNH
  ===================================================== */

  function photoBytes(data) {

    const prefix = "data:image/jpeg;base64,";

    assert(
      typeof data === "string" &&
      data.startsWith(prefix) &&
      data.length <= CONFIG.MAX_PHOTO_LENGTH,
      "INVALID_PHOTO_DATA"
    );

    const encoded = data.slice(prefix.length);

    assert(
      /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) &&
      encoded.length % 4 === 0,
      "INVALID_BASE64"
    );

    let binary;

    try {

      binary = global.atob(encoded);

    } catch (_) {

      throw fail("INVALID_BASE64");

    }

    const bytes = Uint8Array.from(
      binary,
      char => char.charCodeAt(0)
    );

    assert(
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[bytes.length - 2] === 255 &&
      bytes[bytes.length - 1] === 217,
      "INVALID_JPEG"
    );

    return bytes;

  }

  function hashPhoto(data) {

    return hashBytes(photoBytes(data));

  }

  function validPhotoId(id) {

    return typeof id === "string" &&
      /^(HA\d{3}|WASTE_0[1-5])$/.test(id);

  }

  function photoIds(photos) {

    assert(
      isObject(photos),
      "INVALID_PHOTO_MAP"
    );

    const ids = Object.keys(photos).sort();

    assert(
      ids.length <= CONFIG.MAX_PHOTOS,
      "TOO_MANY_PHOTOS"
    );

    assert(
      ids.every(validPhotoId),
      "INVALID_PHOTO_ID"
    );

    return ids;

  }

  async function hashPhotos(photos) {

    const hashes = {};

    for (const id of photoIds(photos)) {

      assert(
        isObject(photos[id]),
        "INVALID_PHOTO_RECORD"
      );

      hashes[id] = await hashPhoto(
        photos[id].data
      );

    }

    return hashes;

  }

  /* =====================================================
     04. KIỂM TRA MODULE VÀ PHIÊN ĐĂNG NHẬP
  ===================================================== */

  function requireModules() {

    assert(
      global.PGDAPI &&
      global.PGDDraft &&
      global.PGDOutbox,
      "MODULE_NOT_READY"
    );

    assert(
      PGDAPI.config.VERSION ===
        CONFIG.API_REVISION,
      "API_VERSION_MISMATCH"
    );

    assert(
      PGDDraft.config.CATALOG_REVISION ===
        CONFIG.CATALOG_REVISION,
      "CATALOG_MISMATCH"
    );

    assert(
      navigator.locks &&
      typeof navigator.locks.request === "function",
      "WEB_LOCKS_UNAVAILABLE"
    );

  }

  function assertSession(context) {

    requireModules();

    PGDDraft.makeKey(context);

    const profile = PGDAPI.getProfile();

    assert(
      profile &&
      profile.code === context.employee &&
      profile.branch === context.branch,
      "SESSION_MISMATCH"
    );

    assert(
      /^TEST_/.test(context.employee),
      "TEST_ACCOUNT_REQUIRED"
    );

    assert(
      [
        "BEP_PHO",
        "BEP_VAT_TU",
        "CHAY_BAN",
        "VE_SINH"
      ].includes(context.department),
      "INVALID_DEPARTMENT"
    );

    assert(
      navigator.onLine !== false,
      "OFFLINE",
      "Không có kết nối mạng."
    );

  }

  function validateChoice(choice) {

    assert(
      CONFIG.CHOICES.includes(choice),
      "INVALID_CHOICE"
    );

  }

  function withLock(context, callback) {

    requireModules();

    const key = PGDDraft.makeKey(context);

    return navigator.locks.request(
      "PGD_SYNC_" + key,
      {mode: "exclusive"},
      callback
    );

  }

  /* =====================================================
     05. KIỂM TRA ĐIỀU KIỆN XUNG ĐỘT
  ===================================================== */

  function canBackup(local, server, pending) {

    return Boolean(

      local &&
      server &&

      local.dirty === true &&
      server.exists === true &&
      server.success === true &&

      local.catalogRevision ===
        CONFIG.CATALOG_REVISION &&

      server.catalogRevision ===
        CONFIG.CATALOG_REVISION &&

      CONFIG.EDITABLE.includes(local.status) &&
      CONFIG.EDITABLE.includes(server.status) &&

      Number.isSafeInteger(local.serverVersion) &&
      local.serverVersion >= 0 &&

      Number.isSafeInteger(local.localRevision) &&
      local.localRevision >= 0 &&

      Number.isSafeInteger(server.version) &&
      server.version > local.serverVersion &&

      isObject(local.data) &&
      isObject(local.photos) &&
      isObject(server.data) &&
      isObject(server.photos) &&

      !pending

    );

  }

  /* =====================================================
     06. ĐỌC DỮ LIỆU MÁY CHỦ
  ===================================================== */

  async function readServer(context) {

    assertSession(context);

    const server = await PGDAPI.restoreDraft(
      context
    );

    assert(
      server.success === true &&
      server.exists === true &&
      server.catalogRevision ===
        CONFIG.CATALOG_REVISION,
      "INVALID_SERVER_SNAPSHOT"
    );

    const photos = {};

    for (const id of photoIds(server.photos)) {

      assertSession(context);

      const result = await PGDAPI.readPhoto(
        context,
        id
      );

      assert(
        result.success === true &&
        result.photoId === id,
        "SERVER_PHOTO_MISMATCH"
      );

      photoBytes(result.data);

      photos[id] = {
        data: result.data
      };

    }

    const latest = await PGDAPI.restoreDraft(
      context
    );

    assert(
      equal(server, latest),
      "SERVER_CHANGED"
    );

    return {
      server: clone(server),
      serverPhotos: photos
    };

  }

  /* =====================================================
     07. CHỤP SNAPSHOT HAI PHIÊN BẢN
  ===================================================== */

  async function capture(context) {

    assertSession(context);

    const pending = await PGDOutbox.get(
      context
    );

    assert(
      !pending,
      "PENDING_REQUEST",
      "Phải xử lý Outbox trước khi sao lưu."
    );

    const local = await PGDDraft.restoreLocal(
      context
    );

    assert(
      local,
      "LOCAL_DRAFT_NOT_FOUND"
    );

    const remote = await readServer(context);

    assert(
      canBackup(
        local,
        remote.server,
        pending
      ),
      "BACKUP_NOT_ALLOWED"
    );

    const latestLocal =
      await PGDDraft.restoreLocal(context);

    const latestPending =
      await PGDOutbox.get(context);

    assert(
      equal(local, latestLocal) &&
      !latestPending,
      "LOCAL_CHANGED"
    );

    assertSession(context);

    return {

      context: clone(context),

      draftKey: PGDDraft.makeKey(context),

      local: clone(local),

      server: clone(remote.server),

      serverPhotos: clone(remote.serverPhotos)

    };

  }

  /* =====================================================
     08. KIỂM TRA SNAPSHOT CHƯA THAY ĐỔI
  ===================================================== */

  async function assertUnchanged(snapshot) {

    const context = snapshot.context;

    assertSession(context);

    const local = await PGDDraft.restoreLocal(
      context
    );

    const pending = await PGDOutbox.get(
      context
    );

    assert(
      local &&
      equal(local, snapshot.local) &&
      !pending,
      "LOCAL_CHANGED",
      "Dữ liệu thiết bị đã thay đổi."
    );

    const server = await PGDAPI.restoreDraft(
      context
    );

    assert(
      equal(server, snapshot.server),
      "SERVER_CHANGED",
      "Dữ liệu máy chủ đã thay đổi."
    );

    const latestLocal =
      await PGDDraft.restoreLocal(context);

    assert(
      latestLocal &&
      equal(latestLocal, snapshot.local) &&
      !(await PGDOutbox.get(context)),
      "LOCAL_CHANGED"
    );

    assertSession(context);

    return true;

  }

  /* =====================================================
     09. TẠO MANIFEST SAO LƯU
  ===================================================== */

  async function buildManifest(
    snapshot,
    choice,
    backupId
  ) {

    validateChoice(choice);

    assert(
      canBackup(
        snapshot.local,
        snapshot.server,
        null
      ),
      "INVALID_SNAPSHOT"
    );

    assert(
      typeof backupId === "string" &&
      /^[A-Za-z0-9_-]{16,80}$/.test(backupId),
      "INVALID_BACKUP_ID"
    );

    const localPhotoHashes = await hashPhotos(
      snapshot.local.photos
    );

    const serverPhotoHashes = await hashPhotos(
      snapshot.serverPhotos
    );

    assert(
      equal(
        photoIds(snapshot.server.photos),
        Object.keys(serverPhotoHashes).sort()
      ),
      "SERVER_PHOTO_SET_MISMATCH"
    );

    return {

      backupId: backupId,

      choice: choice,

      localVersion:
        snapshot.local.serverVersion,

      localRevision:
        snapshot.local.localRevision,

      serverVersion:
        snapshot.server.version,

      localData:
        clone(snapshot.local.data),

      localHash:
        await hashJson(snapshot.local.data),

      serverHash:
        await hashJson(snapshot.server),

      localPhotoIds:
        Object.keys(localPhotoHashes).sort(),

      serverPhotoIds:
        Object.keys(serverPhotoHashes).sort(),

      localPhotoHashes: localPhotoHashes,

      serverPhotoHashes: serverPhotoHashes

    };

  }

  /* =====================================================
     10. KIỂM TRA BIÊN NHẬN
  ===================================================== */

  function verifyReceipt(receipt, manifest) {

    assert(
      receipt &&
      receipt.success === true &&
      receipt.status === "VERIFIED" &&
      receipt.backupId === manifest.backupId &&
      receipt.choice === manifest.choice &&
      receipt.localVersion === manifest.localVersion &&
      receipt.localRevision === manifest.localRevision &&
      receipt.serverVersion === manifest.serverVersion &&
      receipt.localHash === manifest.localHash &&
      receipt.serverHash === manifest.serverHash &&
      equal(
        receipt.localPhotoHashes,
        manifest.localPhotoHashes
      ) &&
      equal(
        receipt.serverPhotoHashes,
        manifest.serverPhotoHashes
      ) &&
      receipt.localPhotoCount ===
        manifest.localPhotoIds.length &&
      receipt.serverPhotoCount ===
        manifest.serverPhotoIds.length,
      "RECEIPT_MISMATCH"
    );

    return true;

  }

  /* =====================================================
     11. KIỂM TRA TRẠNG THÁI SAO LƯU
  ===================================================== */

  function verifyStatus(status, manifest) {

    assert(
      status.success === true &&
      status.backupId === manifest.backupId &&
      status.localHash === manifest.localHash &&
      status.serverHash === manifest.serverHash &&
      equal(
        status.localRequired.slice().sort(),
        manifest.localPhotoIds
      ) &&
      equal(
        status.serverRequired.slice().sort(),
        manifest.serverPhotoIds
      ) &&
      equal(
        status.localPhotoHashes,
        manifest.localPhotoHashes
      ),
      "BACKUP_STATUS_MISMATCH"
    );

    const localUploaded =
      status.localUploaded.slice().sort();

    const serverUploaded =
      status.serverUploaded.slice().sort();

    assert(
      new Set(localUploaded).size ===
        localUploaded.length &&
      new Set(serverUploaded).size ===
        serverUploaded.length &&
      localUploaded.every(
        id => manifest.localPhotoIds.includes(id)
      ) &&
      serverUploaded.every(
        id => manifest.serverPhotoIds.includes(id)
      ),
      "INVALID_UPLOADED_PHOTOS"
    );

    assert(
      equal(
        Object.keys(status.serverPhotoHashes).sort(),
        serverUploaded
      ),
      "SERVER_HASH_SET_MISMATCH"
    );

    for (const id of serverUploaded) {

      assert(
        status.serverPhotoHashes[id] ===
          manifest.serverPhotoHashes[id],
        "SERVER_PHOTO_HASH_MISMATCH"
      );

    }

    if (status.uploadComplete) {

      assert(
        equal(
          localUploaded,
          manifest.localPhotoIds
        ) &&
        equal(
          serverUploaded,
          manifest.serverPhotoIds
        ),
        "INCOMPLETE_BACKUP"
      );

    }

    return true;

  }

  /* =====================================================
     12. THÔNG BÁO TIẾN ĐỘ
  ===================================================== */

  function notify(callback, stage, completed, total) {

    if (typeof callback !== "function") {
      return;
    }

    try {

      callback({
        stage: stage,
        completed: completed,
        total: total
      });

    } catch (_) {

      // Lỗi hiển thị không thay đổi kết quả sao lưu.

    }

  }

  /* =====================================================
     13. THỰC HIỆN SAO LƯU

     Hàm nội bộ chạy khi đã giữ Web Lock.
     Không tự ghi hoặc thay thế bản nháp.
  ===================================================== */

  async function executeBackup(
    snapshot,
    choice,
    backupId,
    onProgress
  ) {

    const context = snapshot.context;

    assertSession(context);
    validateChoice(choice);

    await PGDAPI.conflictHealth();

    await assertUnchanged(snapshot);

    const manifest = await buildManifest(
      snapshot,
      choice,
      backupId
    );

    const total =
      manifest.localPhotoIds.length +
      manifest.serverPhotoIds.length + 4;

    let completed = 0;

    notify(
      onProgress,
      "BEGIN",
      completed,
      total
    );

    const begin = await PGDAPI.conflictBackupBegin(
      context,
      {
        backupId: manifest.backupId,
        choice: manifest.choice,
        localVersion: manifest.localVersion,
        localRevision: manifest.localRevision,
        serverVersion: manifest.serverVersion,
        localData: manifest.localData,
        localHash: manifest.localHash,
        localPhotoIds: manifest.localPhotoIds,
        localPhotoHashes: manifest.localPhotoHashes
      }
    );

    assert(
      begin.localHash === manifest.localHash &&
      begin.serverHash === manifest.serverHash &&
      equal(
        begin.localPhotoIds.slice().sort(),
        manifest.localPhotoIds
      ) &&
      equal(
        begin.serverPhotoIds.slice().sort(),
        manifest.serverPhotoIds
      ),
      "BEGIN_SNAPSHOT_MISMATCH"
    );

    completed++;

    let status = await PGDAPI.conflictBackupStatus(
      context,
      backupId
    );

    verifyStatus(status, manifest);

    /* Sao lưu ảnh thiết bị */

    for (const id of manifest.localPhotoIds) {

      assertSession(context);

      if (!status.localUploaded.includes(id)) {

        const result =
          await PGDAPI.conflictBackupLocalPhoto(
            context,
            backupId,
            id,
            snapshot.local.photos[id].data
          );

        assert(
          result.hash ===
            manifest.localPhotoHashes[id],
          "LOCAL_PHOTO_HASH_MISMATCH"
        );

      }

      completed++;

      notify(
        onProgress,
        "LOCAL_PHOTO_" + id,
        completed,
        total
      );

    }

    /* Sao lưu ảnh máy chủ */

    for (const id of manifest.serverPhotoIds) {

      assertSession(context);

      if (!status.serverUploaded.includes(id)) {

        const result =
          await PGDAPI.conflictBackupServerPhoto(
            context,
            backupId,
            id
          );

        assert(
          result.hash ===
            manifest.serverPhotoHashes[id],
          "SERVER_PHOTO_HASH_MISMATCH"
        );

      }

      completed++;

      notify(
        onProgress,
        "SERVER_PHOTO_" + id,
        completed,
        total
      );

    }

    /* Kiểm tra toàn bộ dữ liệu */

    status = await PGDAPI.conflictBackupStatus(
      context,
      backupId
    );

    verifyStatus(status, manifest);

    assert(
      status.uploadComplete === true,
      "BACKUP_INCOMPLETE"
    );

    completed++;

    notify(
      onProgress,
      "UPLOAD_COMPLETE",
      completed,
      total
    );

    await assertUnchanged(snapshot);

    /* Tạo biên nhận */

    const receipt = await PGDAPI.conflictBackupVerify(
      context,
      backupId
    );

    verifyReceipt(receipt, manifest);

    completed++;

    notify(
      onProgress,
      "RECEIPT_VERIFIED",
      completed,
      total
    );

    /* Xác minh độc lập */

    const confirmation =
      await PGDAPI.conflictBackupConfirm(
        context,
        {
          backupId: manifest.backupId,
          choice: manifest.choice,
          localVersion: manifest.localVersion,
          localRevision: manifest.localRevision,
          serverVersion: manifest.serverVersion,
          localHash: manifest.localHash,
          serverHash: manifest.serverHash,
          localPhotoHashes: manifest.localPhotoHashes,
          serverPhotoHashes: manifest.serverPhotoHashes
        }
      );

    verifyReceipt(confirmation, manifest);

    assert(
      confirmation.contentVerified === true &&
      confirmation.verificationVersion ===
        CONFIG.VERIFY_VERSION &&
      confirmation.catalogRevision ===
        CONFIG.CATALOG_REVISION &&
      confirmation.draftId === snapshot.draftKey &&
      confirmation.serverWritten === false &&
      confirmation.businessDataWritten === false &&
      confirmation.resolutionAuthorized === false &&
      confirmation.resolutionIntegrated === false,
      "CONFIRMATION_FAILED"
    );

    await assertUnchanged(snapshot);

    completed++;

    notify(
      onProgress,
      "VERIFIED",
      completed,
      total
    );

    return {

      success: true,

      status: "VERIFIED",

      backupId: backupId,

      draftKey: snapshot.draftKey,

      choice: choice,

      localVersion: manifest.localVersion,

      localRevision: manifest.localRevision,

      serverVersion: manifest.serverVersion,

      localHash: manifest.localHash,

      serverHash: manifest.serverHash,

      localPhotoHashes:
        clone(manifest.localPhotoHashes),

      serverPhotoHashes:
        clone(manifest.serverPhotoHashes),

      localPhotoCount:
        manifest.localPhotoIds.length,

      serverPhotoCount:
        manifest.serverPhotoIds.length,

      contentVerified: true,

      resolutionAuthorized: false,

      businessDataWritten: false,

      confirmation: clone(confirmation)

    };

  }

  /* =====================================================
     14. PUBLIC BACKUP

     Tự giữ Web Lock.
     Chưa tích hợp với conflict-resolution.js.
  ===================================================== */

  function backup(context, choice, options) {

    options = options || {};

    validateChoice(choice);

    const safeContext = clone(context);

    const backupId =
      options.backupId || PGDDraft.createId();

    const onProgress = options.onProgress;

    return withLock(safeContext, async function() {

      try {

        const snapshot = await capture(
          safeContext
        );

        return await executeBackup(
          snapshot,
          choice,
          backupId,
          onProgress
        );

      } catch (error) {

        error.backupId = backupId;

        throw error;

      }

    });

  }

  /* =====================================================
     15. KIỂM THỬ NỘI BỘ

     Không ghi Google Drive.
     Không sửa bản nháp.
  ===================================================== */

  async function selfTest() {

    const results = [];

    async function test(name, callback) {

      try {

        const passed = await callback();

        results.push({
          name: name,
          passed: passed === true
        });

      } catch (error) {

        results.push({
          name: name,
          passed: false,
          error: error.message
        });

      }

    }

    async function rejects(callback) {

      try {

        await callback();

        return false;

      } catch (_) {

        return true;

      }

    }

    const local = {
      dirty: true,
      status: "DRAFT",
      catalogRevision: "751",
      serverVersion: 1,
      localRevision: 2,
      data: {},
      photos: {}
    };

    const server = {
      success: true,
      exists: true,
      status: "DRAFT",
      catalogRevision: "751",
      version: 2,
      data: {},
      photos: {}
    };

    await test("01. Module version", () =>
      CONFIG.VERSION === "7.8.4.3-C2.3-B"
    );

    await test("02. Catalog revision", () =>
      CONFIG.CATALOG_REVISION === "751"
    );

    await test("03. JSON sorted keys", () =>
      canonical({b: 2, a: 1}) ===
        '{"a":1,"b":2}'
    );

    await test("04. Nested JSON", () =>
      canonical({b: {z: 1, a: 2}}) ===
        '{"b":{"a":2,"z":1}}'
    );

    await test("05. Array order", () =>
      canonical([2, 1]) === "[2,1]"
    );

    await test("06. Null value", () =>
      canonical(null) === "null"
    );

    await test("07. Boolean value", () =>
      canonical(true) === "true"
    );

    await test("08. Date ISO", () =>
      canonical(
        new Date("2026-01-01T00:00:00Z")
      ) === '"2026-01-01T00:00:00.000Z"'
    );

    await test("09. Equal sorted JSON", () =>
      equal({a: 1, b: 2}, {b: 2, a: 1})
    );

    await test("10. Different JSON", () =>
      !equal({a: 1}, {a: 2})
    );

    await test("11. SHA-256 abc", async () =>
      await hashText("abc") ===
        "ba7816bf8f01cfea414140de5dae2223" +
        "b00361a396177a9cb410ff61f20015ad"
    );

    await test("12. SHA-256 empty", async () =>
      await hashText("") ===
        "e3b0c44298fc1c149afbf4c8996fb924" +
        "27ae41e4649b934ca495991b7852b855"
    );

    await test("13. JSON hash stable", async () =>
      await hashJson({a: 1, b: 2}) ===
      await hashJson({b: 2, a: 1})
    );

    await test("14. JSON hash changes", async () =>
      await hashJson({a: 1}) !==
      await hashJson({a: 2})
    );

    await test("15. Valid hash", async () =>
      validHash(await hashText("PHỞ GÀ ĐỒI"))
    );

    await test("16. Reject invalid hash", () =>
      !validHash("abc")
    );

    await test("17. Valid photo ID", () =>
      validPhotoId("HA001")
    );

    await test("18. Valid waste ID", () =>
      validPhotoId("WASTE_05")
    );

    await test("19. Invalid waste ID", () =>
      !validPhotoId("WASTE_06")
    );

    await test("20. Reject invalid image", () =>
      rejects(() => photoBytes("invalid"))
    );

    await test("21. Reject non JPEG bytes", () =>
      rejects(() =>
        photoBytes("data:image/jpeg;base64,YWJj")
      )
    );

    await test("22. Empty photo map", async () =>
      equal(await hashPhotos({}), {})
    );

    await test("23. Valid conflict", () =>
      canBackup(local, server, null)
    );

    await test("24. Reject pending request", () =>
      !canBackup(local, server, {})
    );

    await test("25. Reject locked local", () =>
      !canBackup(
        {...local, status: "SUBMITTED"},
        server,
        null
      )
    );

    await test("26. Reject locked server", () =>
      !canBackup(
        local,
        {...server, status: "FINALIZED"},
        null
      )
    );

    await test("27. Reject equal versions", () =>
      !canBackup(
        local,
        {...server, version: 1},
        null
      )
    );

    await test("28. Reject clean local", () =>
      !canBackup(
        {...local, dirty: false},
        server,
        null
      )
    );

    await test("29. Reject invalid choice", () =>
      rejects(() => validateChoice("UNKNOWN"))
    );

    await test("30. Manifest preserves raw data",
      async () => {

        const snapshot = {
          local: {
            ...local,
            data: {
              inventory: {},
              generalNote: "Kiểm thử tiếng Việt"
            }
          },
          server: server,
          serverPhotos: {}
        };

        const before = canonical(snapshot);

        const manifest = await buildManifest(
          snapshot,
          "KEEP_LOCAL",
          "TEST_BACKUP_123456789"
        );

        return (
          equal(
            manifest.localData,
            snapshot.local.data
          ) &&
          manifest.localHash ===
            await hashJson(snapshot.local.data) &&
          canonical(snapshot) === before
        );

      }
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
     16. PUBLIC MODULE
  ===================================================== */

  global.PGDCloudBackup = Object.freeze({

    config: CONFIG,

    canonical: canonical,

    hashText: hashText,

    hashJson: hashJson,

    hashPhoto: hashPhoto,

    hashPhotos: hashPhotos,

    backup: backup,

    selfTest: selfTest

  });

})(window);

/************************************************************
 * KẾT THÚC CONFLICT-BACKUP.JS
 ************************************************************/
