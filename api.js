
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.8.2
 * FILE: api.js
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({

    VERSION: "7.8.2",

    API_VERSION: "7.8.1",

    CATALOG_REVISION: "751",

    URL: "https://script.google.com/macros/s/AKfycbymyGCKQYyOqVC6Lf0x_G4jPJckjLy0s4g_mERd-qhm3nh7zWNyeKgwtDs8bZn6LYe6/exec",

    TIMEOUT_MS: 90000,

    MAX_BODY_LENGTH: 850000,

    AUTOSAVE_MS: 5000,

    STATUS_REFRESH_MS: 15000

  });

  let session = null;


  /* =====================================================
     01. MÃ YÊU CẦU
  ===================================================== */

  function createId() {

    return global.PGDDraft.createId();

  }


  /* =====================================================
     02. LỖI API
  ===================================================== */

  function apiError(code, message, details) {

    const error = new Error(message);

    error.code = code;

    error.details = details || null;

    return error;

  }


  /* =====================================================
     03. KẾT NỐI MÁY CHỦ
  ===================================================== */

  async function fetchJson(options) {

    const controller = new AbortController();

    const timer = setTimeout(function() {

      controller.abort();

    }, CONFIG.TIMEOUT_MS);

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

        throw apiError(

          "HTTP_ERROR",

          "Máy chủ trả về HTTP " + response.status

        );

      }

      const raw = await response.text();

      try {

        return JSON.parse(raw);

      } catch (error) {

        throw apiError(

          "INVALID_RESPONSE",

          "Máy chủ không trả về JSON hợp lệ."

        );

      }

    } catch (error) {

      if (error.name === "AbortError") {

        throw apiError(

          "TIMEOUT",

          "Máy chủ phản hồi quá lâu. Chưa xác nhận đồng bộ."

        );

      }

      if (error.code) throw error;

      throw apiError(

        "NETWORK_ERROR",

        "Không kết nối được máy chủ."

      );

    } finally {

      clearTimeout(timer);

    }

  }


  /* =====================================================
     04. KIỂM TRA API
  ===================================================== */

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

      throw apiError(

        "VERSION_MISMATCH",

        "API không đúng phiên bản hệ thống."

      );

    }

    return result;

  }


  /* =====================================================
     05. PHIÊN ĐĂNG NHẬP
  ===================================================== */

  function getSession() {

    if (!session) {

      throw apiError(

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


  /* =====================================================
     06. GỬI YÊU CẦU POST
  ===================================================== */

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

      throw apiError(

        "BODY_TOO_LARGE",

        "Dữ liệu gửi vượt quá giới hạn."

      );

    }

    const response = await fetchJson({

      method: "POST",

      headers: {

        "Content-Type": "text/plain;charset=UTF-8"

      },

      body: raw

    });

    if (

      response.apiVersion !== CONFIG.API_VERSION ||

      response.requestId !== requestId ||

      !response.result

    ) {

      throw apiError(

        "INVALID_RESPONSE",

        "Phản hồi API không khớp yêu cầu."

      );

    }

    const result = response.result;

    if (result.success !== true) {

      throw apiError(

        result.code || "REQUEST_REJECTED",

        result.message || "Máy chủ từ chối yêu cầu.",

        result

      );

    }

    return result;

  }


  /* =====================================================
     07. ĐĂNG NHẬP
  ===================================================== */

  async function login(code, branch, pin) {

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

      throw apiError(

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


  /* =====================================================
     08. KIỂM TRA NGỮ CẢNH
  ===================================================== */

  function checkContext(context) {

    global.PGDDraft.makeKey(context);

    const profile = getProfile();

    if (

      !profile ||

      profile.code !== context.employee ||

      profile.branch !== context.branch

    ) {

      throw apiError(

        "CONTEXT_MISMATCH",

        "Bản nháp không thuộc phiên đăng nhập."

      );

    }

    return context;

  }


  /* =====================================================
     09. BẢN NHÁP
  ===================================================== */

  function restoreDraft(context) {

    return request("restoreDraft", {

      context: checkContext(context)

    });

  }


  function saveDraft(context, fields, version, requestId) {

    return request(

      "saveDraft",

      {

        context: checkContext(context),

        data: fields,

        deviceId: global.PGDDraft.getDeviceId(),

        expectedVersion: version

      },

      {requestId: requestId}

    );

  }


  /* =====================================================
     10. HÌNH ẢNH
  ===================================================== */

  function savePhoto(

    context,

    photoId,

    data,

    version,

    requestId

  ) {

    return request(

      "savePhoto",

      {

        context: checkContext(context),

        photoId: photoId,

        data: data,

        deviceId: global.PGDDraft.getDeviceId(),

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

    context,

    photoId,

    version,

    requestId

  ) {

    return request(

      "removePhoto",

      {

        context: checkContext(context),

        photoId: photoId,

        deviceId: global.PGDDraft.getDeviceId(),

        expectedVersion: version

      },

      {requestId: requestId}

    );

  }


  /* =====================================================
     11. DANH MỤC VÀ KIỂM TRA
  ===================================================== */

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
     12. XUẤT MODULE
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

    departmentStatus: departmentStatus

  });

})(window);

/************************************************************
 * KẾT THÚC API.JS
 ************************************************************/
