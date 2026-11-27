
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.8.4.2-A
 * FILE: outbox.js
 *
 * Lưu yêu cầu đồng bộ trước khi gửi API.
 * Không lưu token hoặc PIN.
 * Không tự động ghi đè yêu cầu chưa hoàn thành.
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({

    VERSION: "7.8.4.2",

    CATALOG_REVISION: "751",

    DB_NAME: "PGD_SYNC_OUTBOX_V2",

    DB_VERSION: 1,

    STORE_NAME: "requests",

    MAX_PHOTO_LENGTH: 750000,

    MAX_FIELDS_LENGTH: 30000,

    ACTIONS: Object.freeze([
      "saveDraft",
      "savePhoto",
      "removePhoto"
    ])

  });

  let dbPromise = null;


  /* =====================================================
     01. HÀM HỖ TRỢ
  ===================================================== */

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


  function isObject(value) {

    return value !== null &&
      typeof value === "object" &&
      !Array.isArray(value);

  }


  function keyOf(context) {

    assert(
      global.PGDDraft,
      "DRAFT_MODULE_MISSING",
      "Chưa tải module bản nháp."
    );

    return global.PGDDraft.makeKey(context);

  }


  function now() {

    return new Date().toISOString();

  }


  function canonical(value) {

    if (Array.isArray(value)) {

      return "[" +
        value.map(canonical).join(",") +
        "]";

    }

    if (isObject(value)) {

      return "{" +
        Object.keys(value)
          .sort()
          .map(function(key) {

            return JSON.stringify(key) +
              ":" +
              canonical(value[key]);

          })
          .join(",") +
        "}";

    }

    return JSON.stringify(value);

  }


  /* =====================================================
     02. MỞ INDEXED DB
  ===================================================== */

  function openDatabase() {

    if (dbPromise) {

      return dbPromise;

    }

    dbPromise = new Promise(
      function(resolve, reject) {

        if (!global.indexedDB) {

          reject(fail(
            "INDEXEDDB_UNAVAILABLE",
            "Thiết bị không hỗ trợ IndexedDB."
          ));

          return;

        }

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

            db.createObjectStore(
              CONFIG.STORE_NAME,
              {keyPath: "key"}
            );

          }

        };

        request.onsuccess = function() {

          const db = request.result;

          db.onversionchange = function() {

            db.close();

            dbPromise = null;

          };

          resolve(db);

        };

        request.onerror = function() {

          reject(
            request.error ||
            fail(
              "DATABASE_ERROR",
              "Không mở được Outbox."
            )
          );

        };

        request.onblocked = function() {

          reject(fail(
            "DATABASE_BLOCKED",
            "Hãy đóng các tab website cũ."
          ));

        };

      }
    ).catch(function(error) {

      dbPromise = null;

      throw error;

    });

    return dbPromise;

  }


  /* =====================================================
     03. GIAO DỊCH INDEXED DB
  ===================================================== */

  async function transaction(
    mode,
    operation
  ) {

    const db = await openDatabase();

    return new Promise(
      function(resolve, reject) {

        const tx = db.transaction(

          CONFIG.STORE_NAME,

          mode

        );

        const store = tx.objectStore(
          CONFIG.STORE_NAME
        );

        let result;

        let failure;

        function abort(error) {

          failure = error;

          try {

            tx.abort();

          } catch (_) {

            reject(error);

          }

        }

        try {

          operation(

            store,

            function(value) {

              result = value;

            },

            abort

          );

        } catch (error) {

          abort(error);

        }

        tx.oncomplete = function() {

          resolve(result);

        };

        tx.onerror = function() {

          reject(
            failure ||
            tx.error ||
            fail(
              "TRANSACTION_ERROR",
              "Không lưu được yêu cầu."
            )
          );

        };

        tx.onabort = function() {

          reject(
            failure ||
            tx.error ||
            fail(
              "TRANSACTION_ABORTED",
              "Giao dịch đã bị hủy."
            )
          );

        };

      }
    );

  }


  /* =====================================================
     04. KIỂM TRA YÊU CẦU
  ===================================================== */

  function validateRequest(context, input) {

    const key = keyOf(context);

    assert(
      isObject(input),
      "INVALID_REQUEST",
      "Yêu cầu không hợp lệ."
    );

    assert(
      CONFIG.ACTIONS.includes(input.action),
      "INVALID_ACTION",
      "Thao tác không được hỗ trợ."
    );

    assert(
      typeof input.requestId === "string" &&
      /^[A-Za-z0-9_-]{16,80}$/.test(
        input.requestId
      ),
      "INVALID_REQUEST_ID",
      "Mã yêu cầu không hợp lệ."
    );

    assert(
      Number.isSafeInteger(
        input.expectedVersion
      ) &&
      input.expectedVersion >= 0 &&
      input.expectedVersion <
        Number.MAX_SAFE_INTEGER,
      "INVALID_VERSION",
      "Phiên bản không hợp lệ."
    );

    assert(
      Number.isSafeInteger(
        input.localRevision
      ) &&
      input.localRevision >= 0,
      "INVALID_LOCAL_REVISION",
      "Phiên bản thiết bị không hợp lệ."
    );

    assert(
      isObject(input.payload),
      "INVALID_PAYLOAD",
      "Thiếu nội dung yêu cầu."
    );

    const payload = input.payload;

    let safePayload;

    if (input.action === "saveDraft") {

      assert(
        Object.keys(payload).length === 1 &&
        isObject(payload.data),
        "INVALID_FIELDS",
        "Dữ liệu bản nháp không hợp lệ."
      );

      const allowed = [
        "inventory",
        "supplies",
        "checklist",
        "wasteNote",
        "generalNote"
      ];

      assert(
        Object.keys(payload.data).every(
          key => allowed.includes(key)
        ),
        "INVALID_FIELDS",
        "Có trường dữ liệu không được phép."
      );

      assert(
        JSON.stringify(payload.data).length <=
          CONFIG.MAX_FIELDS_LENGTH,
        "FIELDS_TOO_LARGE",
        "Dữ liệu bản nháp quá lớn."
      );

      safePayload = {
        data: clone(payload.data)
      };

    } else {

      assert(
        typeof payload.photoId === "string" &&
        /^(HA00[1-9]|HA01[0-3]|WASTE_0[1-5])$/
          .test(payload.photoId),
        "INVALID_PHOTO_ID",
        "Mã ảnh không hợp lệ."
      );

      if (input.action === "savePhoto") {

        assert(
          Object.keys(payload).length === 2 &&
          typeof payload.data === "string" &&
          payload.data.startsWith(
            "data:image/jpeg;base64,"
          ) &&
          payload.data.length <=
            CONFIG.MAX_PHOTO_LENGTH,
          "INVALID_PHOTO",
          "Dữ liệu ảnh không hợp lệ."
        );

        safePayload = {

          photoId: payload.photoId,

          data: payload.data

        };

      } else {

        assert(
          Object.keys(payload).length === 1,
          "INVALID_REMOVE_PHOTO",
          "Yêu cầu xóa ảnh không hợp lệ."
        );

        safePayload = {
          photoId: payload.photoId
        };

      }

    }

    return {

      key: key,

      context: {

        date: context.date,

        branch: context.branch,

        shift: context.shift,

        department: context.department,

        employee: context.employee

      },

      catalogRevision:
        CONFIG.CATALOG_REVISION,

      action: input.action,

      requestId: input.requestId,

      expectedVersion:
        input.expectedVersion,

      localRevision:
        input.localRevision,

      payload: safePayload,

      status: "PREPARED",

      attempts: 0,

      lastError: "",

      createdAt: now(),

      updatedAt: now()

    };

  }


  /* =====================================================
     05. SO SÁNH YÊU CẦU
  ===================================================== */

  function sameRequest(a, b) {

    return a.key === b.key &&
      a.requestId === b.requestId &&
      a.action === b.action &&
      a.expectedVersion ===
        b.expectedVersion &&
      a.localRevision ===
        b.localRevision &&
      a.catalogRevision ===
        b.catalogRevision &&
      canonical(a.payload) ===
        canonical(b.payload);

  }


  /* =====================================================
     06. LƯU YÊU CẦU TRƯỚC KHI GỬI
  ===================================================== */

  async function prepare(context, input) {

    const record = validateRequest(
      context,
      input
    );

    return transaction(
      "readwrite",
      function(store, done, abort) {

        const request = store.get(
          record.key
        );

        request.onsuccess = function() {

          try {

            const current = request.result;

            if (current) {

              assert(
                sameRequest(current, record),
                "OUTBOX_OCCUPIED",
                "Còn yêu cầu chưa hoàn thành. " +
                "Không được tạo yêu cầu mới."
              );

              done(clone(current));

              return;

            }

            store.add(record);

            done(clone(record));

          } catch (error) {

            abort(error);

          }

        };

      }
    );

  }


  /* =====================================================
     07. ĐỌC YÊU CẦU ĐANG CHỜ
  ===================================================== */

  async function get(context) {

    const key = keyOf(context);

    return transaction(
      "readonly",
      function(store, done) {

        const request = store.get(key);

        request.onsuccess = function() {

          done(
            request.result
              ? clone(request.result)
              : null
          );

        };

      }
    );

  }


  /* =====================================================
     08. CẬP NHẬT TRẠNG THÁI
  ===================================================== */

  async function update(
    context,
    requestId,
    updater
  ) {

    const key = keyOf(context);

    return transaction(
      "readwrite",
      function(store, done, abort) {

        const request = store.get(key);

        request.onsuccess = function() {

          try {

            const current = request.result;

            assert(
              current &&
              current.requestId === requestId,
              "OUTBOX_REQUEST_MISMATCH",
              "Yêu cầu đang chờ không khớp."
            );

            const updated = updater(
              clone(current)
            );

            assert(
              sameRequest(current, updated),
              "OUTBOX_CONTENT_CHANGED",
              "Không được sửa nội dung yêu cầu."
            );

            updated.updatedAt = now();

            store.put(updated);

            done(clone(updated));

          } catch (error) {

            abort(error);

          }

        };

      }
    );

  }


  /* =====================================================
     09. ĐÁNH DẤU ĐANG GỬI
  ===================================================== */

  function markSending(context, requestId) {

    return update(
      context,
      requestId,
      function(record) {

        assert(
          [
            "PREPARED",
            "UNCERTAIN",
            "SENDING"
          ].includes(record.status),
          "OUTBOX_BLOCKED",
          "Yêu cầu đang bị chặn."
        );

        record.status = "SENDING";

        record.attempts++;

        record.lastError = "";

        return record;

      }
    );

  }


  /* =====================================================
     10. MẤT PHẢN HỒI
  ===================================================== */

  function markUncertain(
    context,
    requestId,
    errorCode
  ) {

    return update(
      context,
      requestId,
      function(record) {

        record.status = "UNCERTAIN";

        record.lastError =
          typeof errorCode === "string" &&
          /^[A-Z0-9_-]{1,80}$/.test(errorCode)
            ? errorCode
            : "SYNC_ERROR";

        return record;

      }
    );

  }


  /* =====================================================
     11. CHẶN XUNG ĐỘT
  ===================================================== */

  function markBlocked(
    context,
    requestId,
    errorCode
  ) {

    return update(
      context,
      requestId,
      function(record) {

        record.status = "BLOCKED";

        record.lastError =
          typeof errorCode === "string" &&
          /^[A-Z0-9_-]{1,80}$/.test(errorCode)
            ? errorCode
            : "VERSION_CONFLICT";

        return record;

      }
    );

  }


  /* =====================================================
     12. XÁC NHẬN HOÀN THÀNH

     Chỉ gọi sau khi:
     - Đã xác minh nội dung trên máy chủ.
     - Đã cập nhật bản nháp IndexedDB.
     - Đã lưu phiên bản mới thành công.

     Module này không tự xác minh máy chủ.
  ===================================================== */

  async function complete(
    context,
    requestId,
    confirmedVersion
  ) {

    const key = keyOf(context);

    return transaction(
      "readwrite",
      function(store, done, abort) {

        const request = store.get(key);

        request.onsuccess = function() {

          try {

            const record = request.result;

            assert(
              record &&
              record.requestId === requestId,
              "OUTBOX_REQUEST_MISMATCH",
              "Không tìm thấy yêu cầu cần xác nhận."
            );

            assert(
              Number.isSafeInteger(
                confirmedVersion
              ) &&
              (
                confirmedVersion ===
                  record.expectedVersion + 1 ||

                (
                  record.action === "removePhoto" &&
                  confirmedVersion ===
                    record.expectedVersion
                )
              ),
              "INVALID_CONFIRMED_VERSION",
              "Phiên bản xác nhận không hợp lệ."
            );

            store.delete(key);

            done({

              success: true,

              requestId: requestId,

              confirmedVersion:
                confirmedVersion

            });

          } catch (error) {

            abort(error);

          }

        };

      }
    );

  }


  /* =====================================================
     13. KIỂM TRA MODULE
  ===================================================== */

  async function health() {

    await openDatabase();

    return {

      success: true,

      version: CONFIG.VERSION,

      catalogRevision:
        CONFIG.CATALOG_REVISION,

      databaseReady: true,

      persistentOutbox: true,

      automaticSyncEnabled: false

    };

  }


  /* =====================================================
     14. XUẤT MODULE
  ===================================================== */

  global.PGDOutbox = Object.freeze({

    config: CONFIG,

    openDatabase: openDatabase,

    prepare: prepare,

    get: get,

    markSending: markSending,

    markUncertain: markUncertain,

    markBlocked: markBlocked,

    complete: complete,

    health: health

  });

})(window);

/************************************************************
 * KẾT THÚC OUTBOX.JS
 ************************************************************/
