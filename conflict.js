
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * FILE: conflict.js
 * VERSION: 7.8.4.3-A
 *
 * So sánh dữ liệu thiết bị và máy chủ.
 * Chỉ đọc. Không ghi đè. Không xóa Outbox.
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({
    VERSION: "7.8.4.3-A",
    CATALOG_REVISION: "751"
  });

  function fail(code, message) {

    const error = new Error(message);
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

  function requireModules() {

    assert(
      global.PGDDraft &&
      global.PGDAPI &&
      global.PGDOutbox &&
      global.PGDSync,
      "MODULE_MISSING",
      "Thiếu module bắt buộc."
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

  }

  /* =====================================================
     01. SO SÁNH TRƯỜNG DỮ LIỆU
  ===================================================== */

  function compareGroup(
    group,
    local,
    server
  ) {

    local = local || {};
    server = server || {};

    const ids = Array.from(
      new Set([
        ...Object.keys(local),
        ...Object.keys(server)
      ])
    ).sort();

    const result = [];

    ids.forEach(function(id) {

      const a = local[id];
      const b = server[id];

      if (equal(a, b)) return;

      result.push({

        group: group,

        id: id,

        localExists: a !== undefined,

        serverExists: b !== undefined,

        local: a === undefined
          ? null
          : clone(a),

        server: b === undefined
          ? null
          : clone(b),

        type: a === undefined
          ? "SERVER_ONLY"
          : b === undefined
            ? "LOCAL_ONLY"
            : "DIFFERENT"

      });

    });

    return result;

  }

  /* =====================================================
     02. SO SÁNH KIỂM KÊ VÀ CHECKLIST
  ===================================================== */

  function compareFields(local, server) {

    local = local || {};
    server = server || {};

    const result = [];

    [
      "inventory",
      "supplies",
      "checklist"
    ].forEach(function(group) {

      result.push(
        ...compareGroup(
          group,
          local[group],
          server[group]
        )
      );

    });

    [
      "wasteNote",
      "generalNote"
    ].forEach(function(id) {

      const a = local[id] || "";
      const b = server[id] || "";

      if (!equal(a, b)) {

        result.push({

          group: "notes",

          id: id,

          local: a,

          server: b,

          type: "DIFFERENT"

        });

      }

    });

    return result;

  }

  /* =====================================================
     03. SO SÁNH NỘI DUNG HÌNH ẢNH
  ===================================================== */

  function comparePhotos(local, server) {

    local = local || {};
    server = server || {};

    const ids = Array.from(
      new Set([
        ...Object.keys(local),
        ...Object.keys(server)
      ])
    ).sort();

    const result = [];

    ids.forEach(function(id) {

      const a = local[id];
      const b = server[id];

      if (
        a && b &&
        typeof a.data === "string" &&
        typeof b.data === "string" &&
        a.data === b.data
      ) {

        return;

      }

      let type;

      if (!a) {

        type = "SERVER_ONLY";

      } else if (!b) {

        type = "LOCAL_ONLY";

      } else if (
        typeof a.data !== "string" ||
        typeof b.data !== "string"
      ) {

        type = "UNVERIFIED";

      } else {

        type = "DIFFERENT";

      }

      result.push({

        id: id,

        type: type,

        localExists: Boolean(a),

        serverExists: Boolean(b),

        localFileId: a
          ? a.fileId || null
          : null,

        serverFileId: b
          ? b.fileId || null
          : null,

        localDirty: Boolean(a && a.dirty)

      });

    });

    return result;

  }

  /* =====================================================
     04. PHÂN LOẠI XUNG ĐỘT
  ===================================================== */

  function classify(local, server, pending) {

    if (
      server.exists &&
      !["DRAFT", "REJECTED"]
        .includes(server.status)
    ) {

      return "LOCKED";

    }

    if (pending) {

      return "PENDING_REQUEST";

    }

    if (!local) {

      return server.exists
        ? "SERVER_ONLY"
        : "EMPTY";

    }

    if (
      !server.exists &&
      local.serverVersion > 0
    ) {

      return "SERVER_MISSING";

    }

    if (
      local.serverVersion >
      server.version
    ) {

      return "VERSION_ANOMALY";

    }

    if (
      local.dirty &&
      local.serverVersion !== server.version
    ) {

      return "VERSION_CONFLICT";

    }

    if (
      !local.dirty &&
      local.serverVersion !== server.version
    ) {

      return "SERVER_NEWER";

    }

    if (local.dirty) {

      return "LOCAL_PENDING";

    }

    return "SAME_VERSION";

  }

  /* =====================================================
     05. ĐỌC DỮ LIỆU MÁY CHỦ
  ===================================================== */

  async function readServer(context) {

    const before =
      await PGDAPI.restoreDraft(context);

    assert(
      before.catalogRevision ===
        CONFIG.CATALOG_REVISION,
      "CATALOG_MISMATCH",
      "Danh mục máy chủ không tương thích."
    );

    const photos = {};

    for (
      const id of Object.keys(before.photos || {})
    ) {

      const image = await PGDAPI.readPhoto(
        context,
        id
      );

      assert(
        typeof image.data === "string" &&
        image.data.startsWith(
          "data:image/jpeg;base64,"
        ),
        "INVALID_PHOTO",
        "Không đọc được ảnh " + id
      );

      photos[id] = {

        data: image.data,

        fileId: before.photos[id].fileId

      };

    }

    const after =
      await PGDAPI.restoreDraft(context);

    assert(
      equal(before, after),
      "SERVER_CHANGED",
      "Máy chủ thay đổi trong lúc so sánh."
    );

    return {

      draft: after,

      photos: photos

    };

  }

  /* =====================================================
     06. KIỂM TRA XUNG ĐỘT THỰC TẾ
  ===================================================== */

  async function inspect(context) {

    requireModules();

    assertSession(context);

    assert(
      navigator.onLine,
      "OFFLINE",
      "Cần kết nối mạng để so sánh."
    );

    assert(
      navigator.locks &&
      typeof navigator.locks.request ===
        "function",
      "WEB_LOCKS_UNAVAILABLE",
      "Trình duyệt chưa hỗ trợ khóa."
    );

    const key = PGDDraft.makeKey(context);

    return navigator.locks.request(

      "PGD_SYNC_" + key,

      {mode: "exclusive"},

      async function() {

        const local =
          await PGDDraft.restoreLocal(context);

        const pending =
          await PGDOutbox.get(context);

        const remote =
          await readServer(context);

        const latestLocal =
          await PGDDraft.restoreLocal(context);

        const latestPending =
          await PGDOutbox.get(context);

        assert(
          equal(local, latestLocal) &&
          equal(pending, latestPending),
          "LOCAL_CHANGED",
          "Thiết bị thay đổi trong lúc so sánh."
        );

        const server = remote.draft;

        const fields = compareFields(

          local ? local.data : {},

          server.data || {}

        );

        const photos = comparePhotos(

          local ? local.photos : {},

          remote.photos

        );

        const state = classify(
          local,
          server,
          pending
        );

        return {

          success: true,

          moduleVersion: CONFIG.VERSION,

          context: clone(context),

          state: state,

          localVersion: local
            ? local.serverVersion
            : 0,

          serverVersion: server.version,

          localRevision: local
            ? local.localRevision
            : 0,

          localDirty: Boolean(
            local && local.dirty
          ),

          serverStatus: server.status,

          pendingRequest: pending
            ? {
                requestId: pending.requestId,
                action: pending.action,
                status: pending.status,
                expectedVersion:
                  pending.expectedVersion
              }
            : null,

          fieldDifferences: fields,

          photoDifferences: photos,

          totalDifferences:
            fields.length + photos.length,

          resolutionEnabled: false,

          inspectedAt:
            new Date().toISOString()

        };

      }

    );

  }

  /* =====================================================
     07. KIỂM THỬ TỰ ĐỘNG
  ===================================================== */

  function selfTest() {

    const results = [];

    function test(name, callback) {

      try {

        assert(
          callback() === true,
          "TEST_FAILED",
          "Kết quả không đạt."
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

      serverVersion: 5,

      dirty: true

    };

    const server = {

      exists: true,

      version: 6,

      status: "DRAFT"

    };

    test("01. Đúng phiên bản", () =>
      CONFIG.VERSION === "7.8.4.3-A"
    );

    test("02. Danh mục 751", () =>
      CONFIG.CATALOG_REVISION === "751"
    );

    test("03. So sánh không phụ thuộc thứ tự", () =>
      equal({a: 1, b: 2}, {b: 2, a: 1})
    );

    test("04. Phát hiện khác số lượng", () =>
      !equal({remaining: 12}, {remaining: 15})
    );

    test("05. Kiểm kê giống nhau", () =>
      compareGroup(
        "inventory",
        {KK001: 12},
        {KK001: 12}
      ).length === 0
    );

    test("06. Kiểm kê khác nhau", () =>
      compareGroup(
        "inventory",
        {KK001: 12},
        {KK001: 15}
      )[0].type === "DIFFERENT"
    );

    test("07. Chỉ có dữ liệu thiết bị", () =>
      compareGroup(
        "inventory",
        {KK001: 12},
        {}
      )[0].type === "LOCAL_ONLY"
    );

    test("08. Chỉ có dữ liệu máy chủ", () =>
      compareGroup(
        "inventory",
        {},
        {KK001: 12}
      )[0].type === "SERVER_ONLY"
    );

    test("09. Phát hiện khác vật tư", () =>
      compareFields(
        {supplies: {KK007: "Còn"}},
        {supplies: {KK007: "Hết"}}
      ).length === 1
    );

    test("10. Phát hiện khác checklist", () =>
      compareFields(
        {checklist: {CL001: true}},
        {checklist: {CL001: false}}
      ).length === 1
    );

    test("11. Phát hiện khác ghi chú", () =>
      compareFields(
        {generalNote: "A"},
        {generalNote: "B"}
      ).length === 1
    );

    test("12. Phát hiện khác giải trình hủy", () =>
      compareFields(
        {wasteNote: "A"},
        {wasteNote: "B"}
      ).length === 1
    );

    test("13. Ảnh giống nội dung", () =>
      comparePhotos(
        {HA001: {data: "ABC"}},
        {HA001: {data: "ABC"}}
      ).length === 0
    );

    test("14. Ảnh khác nội dung", () =>
      comparePhotos(
        {HA001: {data: "ABC"}},
        {HA001: {data: "XYZ"}}
      )[0].type === "DIFFERENT"
    );

    test("15. Ảnh chỉ có trên thiết bị", () =>
      comparePhotos(
        {HA001: {data: "ABC"}},
        {}
      )[0].type === "LOCAL_ONLY"
    );

    test("16. Ảnh chỉ có trên máy chủ", () =>
      comparePhotos(
        {},
        {HA001: {data: "ABC"}}
      )[0].type === "SERVER_ONLY"
    );

    test("17. Không xác nhận ảnh thiếu nội dung", () =>
      comparePhotos(
        {HA001: {fileId: "A"}},
        {HA001: {fileId: "A"}}
      )[0].type === "UNVERIFIED"
    );

    test("18. Phát hiện xung đột phiên bản", () =>
      classify(local, server, null) ===
        "VERSION_CONFLICT"
    );

    test("19. Ưu tiên yêu cầu Outbox", () =>
      classify(local, server, {}) ===
        "PENDING_REQUEST"
    );

    test("20. Ưu tiên khóa báo cáo", () =>
      classify(
        local,
        Object.assign({}, server, {
          status: "APPROVED"
        }),
        {}
      ) === "LOCKED"
    );

    test("21. Thiết bị chưa có bản nháp", () =>
      classify(null, server, null) ===
        "SERVER_ONLY"
    );

    test("22. Máy chủ có phiên bản mới", () =>
      classify(
        Object.assign({}, local, {
          dirty: false
        }),
        server,
        null
      ) === "SERVER_NEWER"
    );

    test("23. Phiên bản bất thường", () =>
      classify(
        Object.assign({}, local, {
          serverVersion: 10
        }),
        server,
        null
      ) === "VERSION_ANOMALY"
    );

    test("24. Không tìm thấy bản nháp máy chủ", () =>
      classify(
        local,
        {
          exists: false,
          version: 0,
          status: "DRAFT"
        },
        null
      ) === "SERVER_MISSING"
    );

    test("25. Dữ liệu đang chờ gửi", () =>
      classify(
        local,
        Object.assign({}, server, {
          version: 5
        }),
        null
      ) === "LOCAL_PENDING"
    );

    test("26. Không thay đổi dữ liệu đầu vào", () => {

      const a = {
        inventory: {
          KK001: {
            remaining: 12,
            waste: 0
          }
        }
      };

      const before = JSON.stringify(a);

      compareFields(a, {});

      return JSON.stringify(a) === before;

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
     08. XUẤT MODULE
  ===================================================== */

  global.PGDConflict = Object.freeze({

    config: CONFIG,

    compareFields: compareFields,

    comparePhotos: comparePhotos,

    classify: classify,

    inspect: inspect,

    selfTest: selfTest

  });

})(window);

/************************************************************
 * KẾT THÚC CONFLICT.JS
 ************************************************************/
