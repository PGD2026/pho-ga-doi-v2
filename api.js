
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: api.js
 * VERSION: 7.8.4.2-B
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.2-B",
    API_VERSION: "7.8.1",
    CATALOG_REVISION: "751",
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
     GỬI ĐÚNG YÊU CẦU ĐÃ LƯU TRONG OUTBOX
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
    sendPending: sendPending
  });

})(window);
