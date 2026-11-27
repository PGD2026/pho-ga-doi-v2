
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: conflict-backup.js
 * VERSION: 7.8.4.3-C2.3-C1
 *
 * - Sao lưu xung đột Google Drive.
 * - Xác minh SHA-256.
 * - Phiên Web Lock dùng chung.
 * - Không tự ghi đè bản nháp.
 * - Không tự xử lý xung đột.
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({

    VERSION: "7.8.4.3-C2.3-C1",

    API_REVISION: "7.8.4.3-C2.3-A",

    CATALOG_REVISION: "751",

    VERIFY_VERSION: "7.8.4.3-C2.1",

    MAX_PHOTOS: 10,

    MAX_PHOTO_LENGTH: 750000,

    LOCK_PREFIX: "PGD_SYNC_",

    CHOICES: Object.freeze([
      "KEEP_LOCAL",
      "KEEP_SERVER"
    ]),

    EDITABLE: Object.freeze([
      "DRAFT",
      "REJECTED"
    ])

  });

  const sessions = new WeakMap();

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

  function isObject(value) {

    return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value);

  }

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
            .map(key =>
              JSON.stringify(key) +
              ":" +
              serialize(item[key])
            )
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

  function validBackupId(id) {

    return typeof id === "string" &&
      /^[A-Za-z0-9_-]{16,80}$/.test(id);

  }

  function validateChoice(choice) {

    assert(
      CONFIG.CHOICES.includes(choice),
      "INVALID_CHOICE"
    );

  }

  /* =====================================================
     02. SHA-256
  ===================================================== */

  async function hashBytes(bytes) {

    assert(
      global.crypto &&
      global.crypto.subtle,
      "CRYPTO_UNAVAILABLE"
    );

    const digest = await global.crypto.subtle.digest(
      "SHA-256",
      bytes
    );

    return Array.from(
      new Uint8Array(digest)
    ).map(
      byte => byte.toString(16).padStart(2, "0")
    ).join("");

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
     03. HÌNH ẢNH
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
     04. KIỂM TRA MODULE
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

  /* =====================================================
     05. PHIÊN KHÓA CHUNG
  ===================================================== */

  function createSession(context, key) {

    const token = Object.freeze({});

    sessions.set(token, {

      context: clone(context),

      key: key,

      active: true,

      busy: false,

      verified: null

    });

    return token;

  }

  function getSession(token) {

    const state = sessions.get(token);

    assert(
      state && state.active === true,
      "LOCK_SESSION_INVALID"
    );

    return state;

  }

  function closeSession(token) {

    const state = sessions.get(token);

    if (state) {

      state.active = false;

      state.verified = null;

      sessions.delete(token);

    }

  }

  function assertSessionContext(state, context) {

    assert(
      equal(state.context, context),
      "LOCK_CONTEXT_MISMATCH"
    );

  }

  function enterSession(state) {

    assert(
      state.active === true,
      "LOCK_SESSION_INVALID"
    );

    assert(
      state.busy === false,
      "LOCK_SESSION_BUSY"
    );

    state.busy = true;

  }

  function leaveSession(state) {

    state.busy = false;

  }

  async function withSession(context, callback) {

    requireModules();

    assert(
      typeof callback === "function",
      "INVALID_SESSION_CALLBACK"
    );

    const safeContext = clone(context);

    assertSession(safeContext);

    const key = PGDDraft.makeKey(safeContext);

    return navigator.locks.request(

      CONFIG.LOCK_PREFIX + key,

      {mode: "exclusive"},

      async function(lock) {

        assert(
          lock &&
          lock.mode === "exclusive" &&
          lock.name === CONFIG.LOCK_PREFIX + key,
          "LOCK_NOT_ACQUIRED"
        );

        assertSession(safeContext);

        const token = createSession(
          safeContext,
          key
        );

        try {

          return await callback(token);

        } finally {

          closeSession(token);

        }

      }

    );

  }

  /* =====================================================
     06. ĐIỀU KIỆN XUNG ĐỘT
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
     07. ĐỌC MÁY CHỦ
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
     08. SNAPSHOT
  ===================================================== */

  async function capture(context) {

    assertSession(context);

    const pending = await PGDOutbox.get(context);

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
      canBackup(local, remote.server, pending),
      "BACKUP_NOT_ALLOWED"
    );

    const latestLocal =
      await PGDDraft.restoreLocal(context);

    const latestPending =
      await PGDOutbox.get(context);

    assert(
      latestLocal &&
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

  async function assertUnchanged(snapshot) {

    const context = snapshot.context;

    assertSession(context);

    const local = await PGDDraft.restoreLocal(
      context
    );

    const pending = await PGDOutbox.get(context);

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

  async function captureInSession(token) {

    const state = getSession(token);

    enterSession(state);

    try {

      const snapshot = await capture(
        state.context
      );

      getSession(token);

      return snapshot;

    } finally {

      leaveSession(state);

    }

  }

  /* =====================================================
     09. MANIFEST
  ===================================================== */

  async function buildManifest(
    snapshot,
    choice,
    backupId
  ) {

    validateChoice(choice);

    assert(
      canBackup(snapshot.local, snapshot.server, null),
      "INVALID_SNAPSHOT"
    );

    assert(
      validBackupId(backupId),
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

      localVersion: snapshot.local.serverVersion,

      localRevision: snapshot.local.localRevision,

      serverVersion: snapshot.server.version,

      localData: clone(snapshot.local.data),

      localHash: await hashJson(snapshot.local.data),

      serverHash: await hashJson(snapshot.server),

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
      isObject(receipt.localPhotoHashes) &&
      isObject(receipt.serverPhotoHashes) &&
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

  function verifyConfirmation(
    confirmation,
    manifest,
    draftKey
  ) {

    verifyReceipt(confirmation, manifest);

    assert(
      confirmation.contentVerified === true &&
      confirmation.verificationVersion ===
        CONFIG.VERIFY_VERSION &&
      confirmation.catalogRevision ===
        CONFIG.CATALOG_REVISION &&
      confirmation.draftId === draftKey &&
      confirmation.serverWritten === false &&
      confirmation.businessDataWritten === false &&
      confirmation.resolutionAuthorized === false &&
      confirmation.resolutionIntegrated === false,
      "CONFIRMATION_FAILED"
    );

    return true;

  }

  /* =====================================================
     11. KIỂM TRA TRẠNG THÁI
  ===================================================== */

  function verifyStatus(status, manifest) {

    assert(
      status &&
      status.success === true &&
      status.backupId === manifest.backupId &&
      status.localHash === manifest.localHash &&
      status.serverHash === manifest.serverHash &&
      Array.isArray(status.localRequired) &&
      Array.isArray(status.serverRequired) &&
      Array.isArray(status.localUploaded) &&
      Array.isArray(status.serverUploaded) &&
      isObject(status.localPhotoHashes) &&
      isObject(status.serverPhotoHashes) &&
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
     12. TIẾN ĐỘ
  ===================================================== */

  function notify(callback, stage, completed, total) {

    if (typeof callback !== "function") return;

    try {

      callback({

        stage: stage,

        completed: completed,

        total: total

      });

    } catch (_) {

      // Lỗi giao diện không thay đổi dữ liệu sao lưu.

    }

  }

  /* =====================================================
     13. XÁC MINH ĐỘC LẬP
  ===================================================== */

  async function confirmBackup(
    context,
    manifest,
    draftKey
  ) {

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

          localPhotoHashes:
            manifest.localPhotoHashes,

          serverPhotoHashes:
            manifest.serverPhotoHashes

        }

      );

    verifyConfirmation(
      confirmation,
      manifest,
      draftKey
    );

    return confirmation;

  }

  /* =====================================================
     14. THỰC HIỆN SAO LƯU
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

    notify(onProgress, "BEGIN", completed, total);

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
      begin &&
      begin.success === true &&
      begin.backupId === backupId &&
      begin.localHash === manifest.localHash &&
      begin.serverHash === manifest.serverHash &&
      Array.isArray(begin.localPhotoIds) &&
      Array.isArray(begin.serverPhotoIds) &&
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
          result &&
          result.success === true &&
          result.hash === manifest.localPhotoHashes[id],
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
          result &&
          result.success === true &&
          result.hash === manifest.serverPhotoHashes[id],
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

    const confirmation = await confirmBackup(
      context,
      manifest,
      snapshot.draftKey
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
     15. SAO LƯU TRONG PHIÊN KHÓA CHUNG

     Không yêu cầu Web Lock lần thứ hai.
  ===================================================== */

  async function backupInSession(
    token,
    snapshot,
    choice,
    options
  ) {

    const state = getSession(token);

    validateChoice(choice);

    options = options || {};

    const backupId =
      options.backupId || PGDDraft.createId();

    assert(
      validBackupId(backupId),
      "INVALID_BACKUP_ID"
    );

    const safeSnapshot = clone(snapshot);

    assertSessionContext(
      state,
      safeSnapshot.context
    );

    assert(
      safeSnapshot.draftKey === state.key,
      "DRAFT_KEY_MISMATCH"
    );

    enterSession(state);

    state.verified = null;

    try {

      assertSession(state.context);

      /*
       * Đọc lại toàn bộ dữ liệu thực tế.
       * Không tin snapshot truyền vào nếu đã thay đổi.
       */

      const current = await capture(
        state.context
      );

      assert(
        equal(current, safeSnapshot),
        "SNAPSHOT_CHANGED"
      );

      const result = await executeBackup(

        current,

        choice,

        backupId,

        options.onProgress

      );

      getSession(token);

      assert(
        result.success === true &&
        result.contentVerified === true,
        "CLOUD_BACKUP_NOT_VERIFIED"
      );

      state.verified = {

        snapshot: clone(current),

        choice: choice,

        backupId: backupId,

        result: clone(result),

        consumed: false

      };

      return clone(result);

    } catch (error) {

      state.verified = null;

      error.backupId = backupId;

      throw error;

    } finally {

      leaveSession(state);

    }

  }

  /* =====================================================
     16. KIỂM TRA RÀNG BUỘC BIÊN NHẬN
  ===================================================== */

  function assertBinding(
    verified,
    snapshot,
    choice,
    backupId
  ) {

    assert(
      verified &&
      verified.consumed === false &&
      verified.result &&
      verified.result.success === true &&
      verified.result.contentVerified === true,
      "VERIFIED_BACKUP_REQUIRED"
    );

    assert(
      verified.choice === choice,
      "BACKUP_CHOICE_MISMATCH"
    );

    assert(
      verified.backupId === backupId,
      "BACKUP_ID_MISMATCH"
    );

    assert(
      equal(
        verified.snapshot,
        snapshot
      ),
      "BACKUP_SNAPSHOT_MISMATCH"
    );

    return true;

  }

  /* =====================================================
     17. XÁC MINH LẦN CUỐI TRONG PHIÊN KHÓA

     Dùng trước khi module xử lý xung đột
     thực hiện giao dịch IndexedDB.
  ===================================================== */

  async function verifyInSession(
    token,
    snapshot,
    choice,
    backupId
  ) {

    const state = getSession(token);

    const safeSnapshot = clone(snapshot);

    assertSessionContext(
      state,
      safeSnapshot.context
    );

    assert(
      safeSnapshot.draftKey === state.key,
      "DRAFT_KEY_MISMATCH"
    );

    validateChoice(choice);

    enterSession(state);

    try {

      assertBinding(
        state.verified,
        safeSnapshot,
        choice,
        backupId
      );

      await PGDAPI.conflictHealth();

      const current = await capture(
        state.context
      );

      assert(
        equal(current, safeSnapshot),
        "SNAPSHOT_CHANGED"
      );

      const manifest = await buildManifest(
        current,
        choice,
        backupId
      );

      const confirmation = await confirmBackup(
        state.context,
        manifest,
        state.key
      );

      await assertUnchanged(current);

      getSession(token);

      assertBinding(
        state.verified,
        safeSnapshot,
        choice,
        backupId
      );

      /*
       * Biên nhận trong bộ nhớ chỉ dùng một lần.
       * Không tái sử dụng cho thao tác khác.
       */

      state.verified.consumed = true;

      return {

        success: true,

        status: "VERIFIED",

        backupId: backupId,

        draftKey: state.key,

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

        contentVerified: true,

        resolutionAuthorized: false,

        businessDataWritten: false,

        confirmation: clone(confirmation)

      };

    } catch (error) {

      state.verified = null;

      error.backupId = backupId;

      throw error;

    } finally {

      leaveSession(state);

    }

  }

  /* =====================================================
     18. SAO LƯU ĐỘC LẬP

     Tương thích cloud-backup-test.html cũ.
  ===================================================== */

  function backup(context, choice, options) {

    options = options || {};

    validateChoice(choice);

    const safeContext = clone(context);

    const backupId =
      options.backupId || PGDDraft.createId();

    return withSession(

      safeContext,

      async function(token) {

        try {

          const snapshot =
            await captureInSession(token);

          return await backupInSession(

            token,

            snapshot,

            choice,

            {

              backupId: backupId,

              onProgress: options.onProgress

            }

          );

        } catch (error) {

          error.backupId = backupId;

          throw error;

        }

      }

    );

  }

  /* =====================================================
     19. KIỂM THỬ NỘI BỘ

     30 bài cũ + 12 bài mới.
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

    async function rejects(callback, expectedCode) {

      try {

        await callback();

        return false;

      } catch (error) {

        return !expectedCode ||
          error.code === expectedCode;

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

    /* 30 bài kiểm thử cũ */

    await test("01. Module version", () =>
      CONFIG.VERSION === "7.8.4.3-C2.3-C1"
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

    await test(
      "30. Manifest preserves raw data",
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

    /* 12 bài kiểm thử bổ sung */

    const testContext = {

      date: "2026-12-16",

      branch: "CS1",

      shift: "SANG",

      department: "BEP_PHO",

      employee: "TEST_API01"

    };

    const testKey =
      "20261216-CS1-SANG-BEP_PHO-TEST_API01";

    const testSnapshot = {

      context: clone(testContext),

      draftKey: testKey,

      local: clone(local),

      server: clone(server),

      serverPhotos: {}

    };

    const testBackupId =
      "TEST_BACKUP_123456789";

    function testVerified() {

      return {

        snapshot: clone(testSnapshot),

        choice: "KEEP_LOCAL",

        backupId: testBackupId,

        consumed: false,

        result: {

          success: true,

          contentVerified: true

        }

      };

    }

    await test("31. Reject forged session", () =>
      rejects(
        () => getSession({}),
        "LOCK_SESSION_INVALID"
      )
    );

    await test("32. Valid session lifecycle", () => {

      const token = createSession(
        testContext,
        testKey
      );

      try {

        return getSession(token).key === testKey;

      } finally {

        closeSession(token);

      }

    });

    await test("33. Reject closed session", async () => {

      const token = createSession(
        testContext,
        testKey
      );

      closeSession(token);

      return rejects(
        () => getSession(token),
        "LOCK_SESSION_INVALID"
      );

    });

    await test("34. Reject wrong context", async () => {

      const token = createSession(
        testContext,
        testKey
      );

      try {

        return await rejects(

          () => assertSessionContext(

            getSession(token),

            {...testContext, branch: "CS2"}

          ),

          "LOCK_CONTEXT_MISMATCH"

        );

      } finally {

        closeSession(token);

      }

    });

    await test(
      "35. Reject parallel session operation",
      async () => {

        const token = createSession(
          testContext,
          testKey
        );

        try {

          const state = getSession(token);

          enterSession(state);

          return await rejects(

            () => enterSession(state),

            "LOCK_SESSION_BUSY"

          );

        } finally {

          closeSession(token);

        }

      }
    );

    await test(
      "36. Accept correct backup binding",
      () => assertBinding(

        testVerified(),

        testSnapshot,

        "KEEP_LOCAL",

        testBackupId

      )
    );

    await test("37. Reject wrong choice", () =>
      rejects(

        () => assertBinding(

          testVerified(),

          testSnapshot,

          "KEEP_SERVER",

          testBackupId

        ),

        "BACKUP_CHOICE_MISMATCH"

      )
    );

    await test("38. Reject wrong backup ID", () =>
      rejects(

        () => assertBinding(

          testVerified(),

          testSnapshot,

          "KEEP_LOCAL",

          "TEST_BACKUP_DIFFERENT"

        ),

        "BACKUP_ID_MISMATCH"

      )
    );

    await test("39. Reject changed local revision", () => {

      const changed = clone(testSnapshot);

      changed.local.localRevision++;

      return rejects(

        () => assertBinding(

          testVerified(),

          changed,

          "KEEP_LOCAL",

          testBackupId

        ),

        "BACKUP_SNAPSHOT_MISMATCH"

      );

    });

    await test("40. Reject changed server version", () => {

      const changed = clone(testSnapshot);

      changed.server.version++;

      return rejects(

        () => assertBinding(

          testVerified(),

          changed,

          "KEEP_LOCAL",

          testBackupId

        ),

        "BACKUP_SNAPSHOT_MISMATCH"

      );

    });

    await test("41. Reject consumed receipt", () => {

      const verified = testVerified();

      verified.consumed = true;

      return rejects(

        () => assertBinding(

          verified,

          testSnapshot,

          "KEEP_LOCAL",

          testBackupId

        ),

        "VERIFIED_BACKUP_REQUIRED"

      );

    });

    await test("42. Reject unverified backup", () => {

      const verified = testVerified();

      verified.result.contentVerified = false;

      return rejects(

        () => assertBinding(

          verified,

          testSnapshot,

          "KEEP_LOCAL",

          testBackupId

        ),

        "VERIFIED_BACKUP_REQUIRED"

      );

    });

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
     20. PUBLIC MODULE
  ===================================================== */

  global.PGDCloudBackup = Object.freeze({

    config: CONFIG,

    canonical: canonical,

    hashText: hashText,

    hashJson: hashJson,

    hashPhoto: hashPhoto,

    hashPhotos: hashPhotos,

    backup: backup,

    withSession: withSession,

    captureInSession: captureInSession,

    backupInSession: backupInSession,

    verifyInSession: verifyInSession,

    selfTest: selfTest

  });

})(window);

/************************************************************
 * END OF CONFLICT-BACKUP.JS
 * VERSION: 7.8.4.3-C2.3-C1
 ************************************************************/
