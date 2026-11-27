
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: api.js
 * VERSION: 7.8.4.3-C2.3-A
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.3-C2.3-A",
    API_VERSION: "7.8.1",
    CATALOG_REVISION: "751",
    CONFLICT_REVISION: "7.8.4.3-C2.2-B",
    URL: "https://script.google.com/macros/s/AKfycbymyGCKQYyOqVC6Lf0x_G4jPJckjLy0s4g_mERd-qhm3nh7zWNyeKgwtDs8bZn6LYe6/exec",
    TIMEOUT_MS: 90000,
    MAX_BODY_LENGTH: 850000,
    AUTOSAVE_MS: 5000,
    STATUS_REFRESH_MS: 15000
  });

  let session = null;

  function fail(code, message, details) {
    const error = new Error(message);
    error.code = code;
    error.details = details || null;
    return error;
  }

  function createId() {
    return global.PGDDraft.createId();
  }

  async function fetchJson(options) {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      CONFIG.TIMEOUT_MS
    );

    try {

      const response = await fetch(
        CONFIG.URL,
        Object.assign({}, options, {
          signal: controller.signal,
          redirect: "follow",
          cache: "no-store",
          credentials: "omit"
        })
      );

      if (!response.ok) {
        throw fail(
          "HTTP_ERROR",
          "Lỗi kết nối HTTP " + response.status
        );
      }

      try {
        return await response.json();
      } catch (_) {
        throw fail(
          "INVALID_JSON",
          "Phản hồi máy chủ không hợp lệ."
        );
      }

    } catch (error) {

      if (error.name === "AbortError") {
        throw fail(
          "TIMEOUT",
          "Chưa xác nhận được kết quả API."
        );
      }

      if (error.code) throw error;

      throw fail(
        "NETWORK_ERROR",
        "Không kết nối được máy chủ."
      );

    } finally {
      clearTimeout(timer);
    }

  }

  async function health() {

    const result = await fetchJson({
      method: "GET"
    });

    if (
      result.success !== true ||
      result.version !== "V2.0" ||
      result.apiVersion !== CONFIG.API_VERSION ||
      result.catalogRevision !== CONFIG.CATALOG_REVISION
    ) {
      throw fail(
        "VERSION_MISMATCH",
        "API không tương thích."
      );
    }

    return result;

  }

  function getSession() {

    if (!session) {
      throw fail(
        "LOGIN_REQUIRED",
        "Bạn chưa đăng nhập."
      );
    }

    return {
      code: session.code,
      token: session.token
    };

  }

  function getProfile() {

    if (!session) return null;

    return {
      code: session.code,
      branch: session.branch,
      employee: session.employee,
      expiresAt: session.expiresAt
    };

  }

  async function request(action, data, options) {

    options = options || {};

    const requestId =
      options.requestId || createId();

    const body = {
      action: action,
      requestId: requestId,
      catalogRevision: CONFIG.CATALOG_REVISION,
      data: data || {}
    };

    if (options.auth !== false) {
      body.auth = getSession();
    }

    const raw = JSON.stringify(body);

    if (raw.length > CONFIG.MAX_BODY_LENGTH) {
      throw fail(
        "BODY_TOO_LARGE",
        "Dữ liệu vượt quá giới hạn."
      );
    }

    const response = await fetchJson({
      method: "POST",
      headers: {
        "Content-Type":
          "text/plain;charset=UTF-8"
      },
      body: raw
    });

    if (
      !response ||
      response.apiVersion !== CONFIG.API_VERSION ||
      response.requestId !== requestId ||
      !response.result
    ) {
      throw fail(
        "INVALID_RESPONSE",
        "Phản hồi không khớp yêu cầu."
      );
    }

    const result = response.result;

    if (result.success !== true) {
      throw fail(
        result.code || "REQUEST_REJECTED",
        result.message || "API từ chối yêu cầu.",
        result
      );
    }

    return result;

  }

  async function login(code, branch, pin) {

    session = null;

    const result = await request(
      "login",
      {
        code: String(code).trim().toUpperCase(),
        branch: branch,
        pin: String(pin || "")
      },
      {auth: false}
    );

    if (!result.token || !result.employee) {
      throw fail(
        "LOGIN_FAILED",
        "Không nhận được phiên đăng nhập."
      );
    }

    session = {
      code: result.employee.code,
      token: result.token,
      branch: result.branch,
      employee: result.employee,
      expiresAt: result.expiresAt
    };

    return getProfile();

  }

  async function logout() {

    try {
      if (session) {
        await request("logout", {});
      }
    } finally {
      session = null;
    }

    return true;

  }

  function checkContext(context) {

    global.PGDDraft.makeKey(context);

    const profile = getProfile();

    if (
      !profile ||
      profile.code !== context.employee ||
      profile.branch !== context.branch
    ) {
      throw fail(
        "CONTEXT_MISMATCH",
        "Bản nháp không thuộc phiên đăng nhập."
      );
    }

    return context;

  }

  function restoreDraft(context) {

    return request("restoreDraft", {
      context: checkContext(context)
    });

  }

  function saveDraft(
    context, fields, version, requestId
  ) {

    return request(
      "saveDraft",
      {
        context: checkContext(context),
        data: fields,
        deviceId: PGDDraft.getDeviceId(),
        expectedVersion: version
      },
      {requestId: requestId}
    );

  }

  function savePhoto(
    context, photoId, data, version, requestId
  ) {

    return request(
      "savePhoto",
      {
        context: checkContext(context),
        photoId: photoId,
        data: data,
        deviceId: PGDDraft.getDeviceId(),
        expectedVersion: version
      },
      {requestId: requestId}
    );

  }

  function readPhoto(context, photoId) {

    return request("readPhoto", {
      context: checkContext(context),
      photoId: photoId
    });

  }

  function removePhoto(
    context, photoId, version, requestId
  ) {

    return request(
      "removePhoto",
      {
        context: checkContext(context),
        photoId: photoId,
        deviceId: PGDDraft.getDeviceId(),
        expectedVersion: version
      },
      {requestId: requestId}
    );

  }

  function inventoryCatalog(context) {

    return request("inventoryCatalog", {
      context: checkContext(context)
    });

  }

  function checklistCatalog(context) {

    return request("checklistCatalog", {
      context: checkContext(context)
    });

  }

  function validateInventory(context) {

    return request("validateInventory", {
      context: checkContext(context)
    });

  }

  function validateChecklist(context) {

    return request("validateChecklist", {
      context: checkContext(context)
    });

  }

  function departmentStatus(context) {

    return request("departmentStatus", {
      context: checkContext(context)
    });

  }

  /* =====================================================
     XÁC MINH YÊU CẦU ĐANG CHỜ
  ===================================================== */

  async function requestState(
    context,
    targetAction,
    targetRequestId,
    expectedVersion
  ) {

    const result = await request(
      "requestState",
      {
        context: checkContext(context),
        targetAction: targetAction,
        targetRequestId: targetRequestId,
        expectedVersion: expectedVersion
      }
    );

    if (
      result.targetRequestId !== targetRequestId ||
      result.targetAction !== targetAction ||
      result.expectedVersion !== expectedVersion ||
      ![
        "APPLIED",
        "RETRY_ALLOWED",
        "VERSION_CONFLICT",
        "LOCKED",
        "UNKNOWN"
      ].includes(result.state)
    ) {
      throw fail(
        "INVALID_STATE_RESPONSE",
        "Kết quả xác minh không hợp lệ."
      );
    }

    return result;

  }

  /* =====================================================
     GỬI YÊU CẦU ĐÃ LƯU TRONG OUTBOX
  ===================================================== */

  function sendPending(record) {

    if (
      !record ||
      record.catalogRevision !==
        CONFIG.CATALOG_REVISION
    ) {
      throw fail(
        "INVALID_PENDING",
        "Yêu cầu đang chờ không hợp lệ."
      );
    }

    const context = checkContext(record.context);

    const payload = record.payload;

    switch (record.action) {

      case "saveDraft":

        return saveDraft(
          context,
          payload.data,
          record.expectedVersion,
          record.requestId
        );

      case "savePhoto":

        return savePhoto(
          context,
          payload.photoId,
          payload.data,
          record.expectedVersion,
          record.requestId
        );

      case "removePhoto":

        return removePhoto(
          context,
          payload.photoId,
          record.expectedVersion,
          record.requestId
        );

      default:

        throw fail(
          "INVALID_ACTION",
          "Thao tác không được hỗ trợ."
        );

    }

  }

  /* =====================================================
     C2.3-A - KIỂM TRA CONFLICT API
  ===================================================== */

  async function conflictHealth() {

    const result = await health();

    if (
      result.mode !== "TEST" ||
      result.apiEnabled !== true ||
      result.requestStateEnabled !== true ||
      result.conflictRevision !==
        CONFIG.CONFLICT_REVISION ||
      result.conflictBackupReady !== true ||
      result.conflictVerifyReady !== true ||
      result.conflictApiIntegrated !== true ||
      result.conflictApiEnabled !== true ||
      result.conflictResolutionIntegrated !== false ||
      result.telegramEnabled !== false ||
      result.finalizationEnabled !== false ||
      result.revenueEnabled !== false
    ) {
      throw fail(
        "CONFLICT_API_NOT_READY",
        "Backend sao lưu chưa sẵn sàng.",
        result
      );
    }

    return result;

  }

  /* =====================================================
     KIỂM TRA DỮ LIỆU SAO LƯU
  ===================================================== */

  function conflictAssert(condition, code) {

    if (!condition) {
      throw fail(
        code,
        "Yêu cầu sao lưu không hợp lệ: " + code
      );
    }

  }

  function isObject(value) {

    return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value);

  }

  function cloneJson(value) {

    return JSON.parse(JSON.stringify(value));

  }

  function validBackupId(value) {

    return typeof value === "string" &&
      /^[A-Za-z0-9_-]{16,80}$/.test(value);

  }

  function validHash(value) {

    return typeof value === "string" &&
      /^[a-f0-9]{64}$/.test(value);

  }

  function validPhotoId(value) {

    return typeof value === "string" &&
      /^(HA\d{3}|WASTE_0[1-5])$/.test(value);

  }

  function checkHashMap(value) {

    conflictAssert(
      isObject(value),
      "INVALID_HASH_MAP"
    );

    const ids = Object.keys(value);

    conflictAssert(
      ids.length <= 10,
      "TOO_MANY_PHOTOS"
    );

    ids.forEach(function(id) {

      conflictAssert(
        validPhotoId(id),
        "INVALID_PHOTO_ID"
      );

      conflictAssert(
        validHash(value[id]),
        "INVALID_PHOTO_HASH"
      );

    });

    return cloneJson(value);

  }

  function sameHashMap(a, b) {

    if (!isObject(a) || !isObject(b)) {
      return false;
    }

    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    return keysA.length === keysB.length &&
      keysA.every(function(key, index) {
        return key === keysB[index] &&
          a[key] === b[key];
      });

  }

  function checkConflictContext(context) {

    checkContext(context);

    conflictAssert(
      /^TEST_/.test(context.employee),
      "TEST_ACCOUNT_REQUIRED"
    );

    conflictAssert(
      [
        "BEP_PHO",
        "BEP_VAT_TU",
        "CHAY_BAN",
        "VE_SINH"
      ].includes(context.department),
      "INVALID_CONFLICT_DEPARTMENT"
    );

    return {
      date: context.date,
      branch: context.branch,
      shift: context.shift,
      department: context.department,
      employee: context.employee
    };

  }

  function checkBackupBase(context, backupId) {

    conflictAssert(
      validBackupId(backupId),
      "INVALID_BACKUP_ID"
    );

    return {
      context: checkConflictContext(context),
      backupId: backupId
    };

  }

  function checkVersions(input) {

    conflictAssert(
      Number.isSafeInteger(input.localVersion) &&
      input.localVersion >= 0 &&
      Number.isSafeInteger(input.localRevision) &&
      input.localRevision >= 0 &&
      Number.isSafeInteger(input.serverVersion) &&
      input.serverVersion > input.localVersion,
      "INVALID_CONFLICT_VERSIONS"
    );

  }

  function checkChoice(choice) {

    conflictAssert(
      ["KEEP_LOCAL", "KEEP_SERVER"].includes(choice),
      "INVALID_CONFLICT_CHOICE"
    );

  }

  /* =====================================================
     GỬI CONFLICT API VÀ KIỂM TRA PHẢN HỒI
  ===================================================== */

  async function conflictRequest(action, payload) {

    const currentSession = session;

    getSession();

    const result = await request(action, payload);

    conflictAssert(
      session === currentSession,
      "SESSION_CHANGED"
    );

    conflictAssert(
      result.backupId === payload.backupId,
      "BACKUP_ID_MISMATCH"
    );

    conflictAssert(
      result.conflictApiVersion === "7.8.4.3-C2.2" &&
      result.conflictImplementation ===
        CONFIG.CONFLICT_REVISION,
      "CONFLICT_API_VERSION_MISMATCH"
    );

    conflictAssert(
      result.resolutionAuthorized === false &&
      result.resolutionIntegrated === false &&
      result.businessDataWritten === false,
      "UNSAFE_CONFLICT_RESPONSE"
    );

    return result;

  }

  /* =====================================================
     API 01 - KHỞI TẠO SAO LƯU
  ===================================================== */

  async function conflictBackupBegin(context, input) {

    conflictAssert(
      isObject(input),
      "INVALID_BACKUP_INPUT"
    );

    const payload = checkBackupBase(
      context,
      input.backupId
    );

    checkChoice(input.choice);
    checkVersions(input);

    conflictAssert(
      isObject(input.localData),
      "INVALID_LOCAL_DATA"
    );

    conflictAssert(
      validHash(input.localHash),
      "INVALID_LOCAL_HASH"
    );

    const hashes = checkHashMap(
      input.localPhotoHashes
    );

    conflictAssert(
      Array.isArray(input.localPhotoIds) &&
      input.localPhotoIds.length <= 10 &&
      new Set(input.localPhotoIds).size ===
        input.localPhotoIds.length,
      "INVALID_LOCAL_PHOTO_IDS"
    );

    const ids = input.localPhotoIds.slice().sort();

    conflictAssert(
      JSON.stringify(ids) ===
        JSON.stringify(Object.keys(hashes).sort()),
      "LOCAL_PHOTO_HASH_LIST_MISMATCH"
    );

    Object.assign(payload, {
      choice: input.choice,
      localVersion: input.localVersion,
      localRevision: input.localRevision,
      serverVersion: input.serverVersion,
      localData: cloneJson(input.localData),
      localHash: input.localHash,
      localPhotoIds: ids,
      localPhotoHashes: hashes
    });

    const result = await conflictRequest(
      "conflictBackupBegin",
      payload
    );

    conflictAssert(
      ["UPLOADING", "RECEIPT_EXISTS"]
        .includes(result.status) &&
      result.localHash === payload.localHash &&
      validHash(result.serverHash) &&
      Array.isArray(result.localPhotoIds) &&
      JSON.stringify(
        result.localPhotoIds.slice().sort()
      ) === JSON.stringify(ids) &&
      Array.isArray(result.serverPhotoIds) &&
      result.serverPhotoIds.length <= 10 &&
      new Set(result.serverPhotoIds).size ===
        result.serverPhotoIds.length &&
      result.serverPhotoIds.every(validPhotoId) &&
      result.contentVerified === false,
      "INVALID_BACKUP_BEGIN_RESPONSE"
    );

    return result;

  }

  /* =====================================================
     API 02 - SAO LƯU ẢNH THIẾT BỊ
  ===================================================== */

  async function conflictBackupLocalPhoto(
    context, backupId, photoId, data
  ) {

    const payload = checkBackupBase(
      context,
      backupId
    );

    conflictAssert(
      validPhotoId(photoId),
      "INVALID_PHOTO_ID"
    );

    conflictAssert(
      typeof data === "string" &&
      data.startsWith("data:image/jpeg;base64,") &&
      data.length <= 750000,
      "INVALID_PHOTO_DATA"
    );

    payload.photoId = photoId;
    payload.data = data;

    const result = await conflictRequest(
      "conflictBackupLocalPhoto",
      payload
    );

    conflictAssert(
      result.photoId === photoId &&
      validHash(result.hash) &&
      result.contentVerified === false,
      "INVALID_LOCAL_PHOTO_RESPONSE"
    );

    return result;

  }

  /* =====================================================
     API 03 - SAO LƯU ẢNH MÁY CHỦ
  ===================================================== */

  async function conflictBackupServerPhoto(
    context, backupId, photoId
  ) {

    const payload = checkBackupBase(
      context,
      backupId
    );

    conflictAssert(
      validPhotoId(photoId),
      "INVALID_PHOTO_ID"
    );

    payload.photoId = photoId;

    const result = await conflictRequest(
      "conflictBackupServerPhoto",
      payload
    );

    conflictAssert(
      result.photoId === photoId &&
      validHash(result.hash) &&
      result.contentVerified === false,
      "INVALID_SERVER_PHOTO_RESPONSE"
    );

    return result;

  }

  /* =====================================================
     API 04 - KIỂM TRA TRẠNG THÁI SAO LƯU
  ===================================================== */

  async function conflictBackupStatus(
    context, backupId
  ) {

    const result = await conflictRequest(
      "conflictBackupStatus",
      checkBackupBase(context, backupId)
    );

    conflictAssert(
      [
        "UPLOADING",
        "READY_TO_VERIFY",
        "VERIFIED"
      ].includes(result.status) &&
      Array.isArray(result.localUploaded) &&
      Array.isArray(result.serverUploaded) &&
      Array.isArray(result.localRequired) &&
      Array.isArray(result.serverRequired) &&
      typeof result.uploadComplete === "boolean" &&
      validHash(result.localHash) &&
      validHash(result.serverHash) &&
      result.contentVerified === false,
      "INVALID_BACKUP_STATUS_RESPONSE"
    );

    checkHashMap(result.localPhotoHashes);
    checkHashMap(result.serverPhotoHashes);

    return result;

  }

  /* =====================================================
     API 05 - XÁC MINH BẢN SAO
  ===================================================== */

  async function conflictBackupVerify(
    context, backupId
  ) {

    const result = await conflictRequest(
      "conflictBackupVerify",
      checkBackupBase(context, backupId)
    );

    conflictAssert(
      result.status === "VERIFIED" &&
      validHash(result.localHash) &&
      validHash(result.serverHash) &&
      result.contentVerified === false,
      "INVALID_BACKUP_VERIFY_RESPONSE"
    );

    checkHashMap(result.localPhotoHashes);
    checkHashMap(result.serverPhotoHashes);

    return result;

  }

  /* =====================================================
     API 06 - XÁC MINH ĐỘC LẬP
  ===================================================== */

  async function conflictBackupConfirm(context, input) {

    conflictAssert(
      isObject(input),
      "INVALID_CONFIRM_INPUT"
    );

    const payload = checkBackupBase(
      context,
      input.backupId
    );

    checkChoice(input.choice);
    checkVersions(input);

    conflictAssert(
      validHash(input.localHash) &&
      validHash(input.serverHash),
      "INVALID_CONFIRM_HASH"
    );

    Object.assign(payload, {
      choice: input.choice,
      localVersion: input.localVersion,
      localRevision: input.localRevision,
      serverVersion: input.serverVersion,
      localHash: input.localHash,
      serverHash: input.serverHash,
      localPhotoHashes:
        checkHashMap(input.localPhotoHashes),
      serverPhotoHashes:
        checkHashMap(input.serverPhotoHashes)
    });

    const result = await conflictRequest(
      "conflictBackupConfirm",
      payload
    );

    conflictAssert(
      result.status === "VERIFIED" &&
      result.verificationVersion ===
        "7.8.4.3-C2.1" &&
      result.catalogRevision ===
        CONFIG.CATALOG_REVISION &&
      result.draftId ===
        global.PGDDraft.makeKey(payload.context) &&
      result.choice === payload.choice &&
      result.localVersion === payload.localVersion &&
      result.localRevision === payload.localRevision &&
      result.serverVersion === payload.serverVersion &&
      result.localHash === payload.localHash &&
      result.serverHash === payload.serverHash &&
      sameHashMap(
        result.localPhotoHashes,
        payload.localPhotoHashes
      ) &&
      sameHashMap(
        result.serverPhotoHashes,
        payload.serverPhotoHashes
      ) &&
      result.localPhotoCount ===
        Object.keys(payload.localPhotoHashes).length &&
      result.serverPhotoCount ===
        Object.keys(payload.serverPhotoHashes).length &&
      result.contentVerified === true &&
      result.serverWritten === false,
      "BACKUP_CONFIRMATION_FAILED"
    );

    return result;

  }

  /* =====================================================
     PUBLIC API
  ===================================================== */

  global.PGDAPI = Object.freeze({

    config: CONFIG,

    health: health,
    login: login,
    logout: logout,
    getProfile: getProfile,

    restoreDraft: restoreDraft,
    saveDraft: saveDraft,
    savePhoto: savePhoto,
    readPhoto: readPhoto,
    removePhoto: removePhoto,

    inventoryCatalog: inventoryCatalog,
    checklistCatalog: checklistCatalog,
    validateInventory: validateInventory,
    validateChecklist: validateChecklist,
    departmentStatus: departmentStatus,

    requestState: requestState,
    sendPending: sendPending,

    conflictHealth: conflictHealth,

    conflictBackupBegin:
      conflictBackupBegin,

    conflictBackupLocalPhoto:
      conflictBackupLocalPhoto,

    conflictBackupServerPhoto:
      conflictBackupServerPhoto,

    conflictBackupStatus:
      conflictBackupStatus,

    conflictBackupVerify:
      conflictBackupVerify,

    conflictBackupConfirm:
      conflictBackupConfirm

  });

})(window);

/************************************************************
 * KẾT THÚC API.JS
 ************************************************************/
