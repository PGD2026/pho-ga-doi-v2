
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.4
 * LƯU BẢN NHÁP TRÊN THIẾT BỊ
 * IndexedDB
 ************************************************************/

(function (global) {

  "use strict";

  const CONFIG = Object.freeze({

    DB_NAME: "PGD_OPERATION_V2",

    DB_VERSION: 1,

    STORE_NAME: "drafts",

    DEVICE_KEY: "PGD_V2_DEVICE_ID",

    AUTOSAVE_MS: 5000,

    MAX_PHOTO_LENGTH: 750000

  });

  let dbPromise = null;

  const timers = new Map();

  const queues = new Map();


  /* =====================================================
     01. MÃ ĐỊNH DANH
  ===================================================== */

  function createId() {

    if (

      global.crypto &&

      typeof global.crypto.randomUUID === "function"

    ) {

      return global.crypto.randomUUID();

    }

    if (!global.crypto) {

      throw new Error("Trình duyệt không hỗ trợ mã định danh.");

    }

    const bytes = new Uint8Array(16);

    global.crypto.getRandomValues(bytes);

    return Array.from(bytes)

      .map(b => b.toString(16).padStart(2, "0"))

      .join("");

  }


  function getDeviceId() {

    let id = localStorage.getItem(CONFIG.DEVICE_KEY);

    if (!id) {

      id = createId();

      localStorage.setItem(CONFIG.DEVICE_KEY, id);

    }

    return id;

  }


  function makeKey(context) {

    if (!context) {

      throw new Error("Thiếu thông tin bản nháp.");

    }

    const date = String(context.date || "");

    const branch = String(context.branch || "");

    const shift = String(context.shift || "");

    const department = String(context.department || "");

    const employee = String(context.employee || "");

    if (

      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||

      !["CS1", "CS2"].includes(branch) ||

      !["SANG", "TOI", "DEM"].includes(shift) ||

      ![

        "BEP_PHO",

        "BEP_VAT_TU",

        "CHAY_BAN",

        "VE_SINH",

        "TRUONG_CA"

      ].includes(department) ||

      !/^[A-Z0-9_-]{2,24}$/.test(employee)

    ) {

      throw new Error("Thông tin bản nháp không hợp lệ.");

    }

    return [

      date.replace(/-/g, ""),

      branch,

      shift,

      department,

      employee

    ].join("-");

  }


  /* =====================================================
     02. MỞ INDEXED DB
  ===================================================== */

  function openDatabase() {

    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function(resolve, reject) {

      if (!global.indexedDB) {

        reject(new Error("Thiết bị không hỗ trợ IndexedDB."));

        return;

      }

      const request = indexedDB.open(

        CONFIG.DB_NAME,

        CONFIG.DB_VERSION

      );

      request.onupgradeneeded = function() {

        const db = request.result;

        if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {

          const store = db.createObjectStore(

            CONFIG.STORE_NAME,

            {keyPath: "key"}

          );

          store.createIndex(

            "updatedAt", "updatedAt"

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

        reject(request.error);

      };

      request.onblocked = function() {

        reject(new Error("Cơ sở dữ liệu đang bị khóa."));

      };

    }).catch(function(error) {

      dbPromise = null;

      throw error;

    });

    return dbPromise;

  }


  /* =====================================================
     03. THAO TÁC LƯU TRỮ
  ===================================================== */

  async function readRecord(key) {

    const db = await openDatabase();

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(

        CONFIG.STORE_NAME, "readonly"

      );

      const request = tx.objectStore(

        CONFIG.STORE_NAME

      ).get(key);

      request.onsuccess = function() {

        resolve(request.result || null);

      };

      request.onerror = function() {

        reject(request.error);

      };

    });

  }


  async function updateRecord(key, updater) {

    const db = await openDatabase();

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(

        CONFIG.STORE_NAME, "readwrite"

      );

      const store = tx.objectStore(CONFIG.STORE_NAME);

      const request = store.get(key);

      let result;

      let failure;

      request.onsuccess = function() {

        try {

          result = updater(request.result || null);

          store.put(result);

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

        reject(failure || tx.error ||

          new Error("Không lưu được bản nháp."));

      };

    });

  }


  function clone(value) {

    return JSON.parse(JSON.stringify(value));

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


  function newRecord(context) {

    return {

      key: makeKey(context),

      context: clone(context),

      deviceId: getDeviceId(),

      data: emptyFields(),

      photos: {},

      removedPhotos: [],

      serverVersion: 0,

      localRevision: 0,

      dirty: true,

      status: "DRAFT",

      createdAt: new Date().toISOString(),

      updatedAt: new Date().toISOString(),

      syncedAt: null

    };

  }


  function assertEditable(record) {

    if (

      !["DRAFT", "REJECTED"].includes(record.status)

    ) {

      throw new Error("Bản nháp đã bị khóa.");

    }

  }


  function touch(record) {

    record.localRevision++;

    record.updatedAt = new Date().toISOString();

    record.dirty = true;

    return record;

  }


  /* =====================================================
     04. LƯU NỘI DUNG
  ===================================================== */

  async function saveLocal(context, data) {

    const key = makeKey(context);

    const fields = clone(data);

    return updateRecord(key, function(old) {

      const record = old || newRecord(context);

      assertEditable(record);

      record.data = fields;

      return touch(record);

    });

  }


  /* =====================================================
     05. LƯU HÌNH ẢNH
  ===================================================== */

  async function savePhotoLocal(context, photoId, data) {

    if (

      !/^(HA0[0-9]{2}|WASTE_0[1-5])$/.test(photoId) ||

      typeof data !== "string" ||

      !data.startsWith("data:image/jpeg;base64,") ||

      data.length > CONFIG.MAX_PHOTO_LENGTH

    ) {

      throw new Error("Hình ảnh không hợp lệ.");

    }

    const key = makeKey(context);

    return updateRecord(key, function(old) {

      const record = old || newRecord(context);

      assertEditable(record);

      record.photos[photoId] = {

        data: data,

        dirty: true,

        updatedAt: new Date().toISOString()

      };

      record.removedPhotos = record.removedPhotos

        .filter(id => id !== photoId);

      return touch(record);

    });

  }


  async function removePhotoLocal(context, photoId) {

    const key = makeKey(context);

    return updateRecord(key, function(record) {

      if (!record) {

        throw new Error("Không tìm thấy bản nháp.");

      }

      assertEditable(record);

      delete record.photos[photoId];

      if (!record.removedPhotos.includes(photoId)) {

        record.removedPhotos.push(photoId);

      }

      return touch(record);

    });

  }


  /* =====================================================
     06. KHÔI PHỤC BẢN NHÁP
  ===================================================== */

  async function restoreLocal(context) {

    return readRecord(makeKey(context));

  }


  /* =====================================================
     07. GHI NHẬN ĐỒNG BỘ THÀNH CÔNG

     Chỉ gọi sau khi API xác nhận.
     Không đánh dấu sạch nếu đã có thay đổi mới.
  ===================================================== */

  async function markSynced(

    context,

    serverVersion,

    sentRevision

  ) {

    if (

      !Number.isInteger(serverVersion) ||

      serverVersion < 1

    ) {

      throw new Error("Phiên bản máy chủ không hợp lệ.");

    }

    return updateRecord(

      makeKey(context),

      function(record) {

        if (!record) {

          throw new Error("Không tìm thấy bản nháp.");

        }

        if (serverVersion < record.serverVersion) {

          throw new Error("Phản hồi máy chủ đã cũ.");

        }

        record.serverVersion = serverVersion;

        record.syncedAt = new Date().toISOString();

        if (record.localRevision === sentRevision) {

          record.dirty = false;

          record.removedPhotos = [];

          Object.values(record.photos)

            .forEach(photo => {

              photo.dirty = false;

            });

        }

        return record;

      }

    );

  }


  /* =====================================================
     08. KHÓA BẢN NHÁP

     Chỉ sử dụng khi máy chủ xác nhận trạng thái.
  ===================================================== */

  async function setStatus(context, status) {

    const allowed = [

      "DRAFT",

      "REJECTED",

      "SUBMITTED",

      "APPROVED",

      "FINALIZED"

    ];

    if (!allowed.includes(status)) {

      throw new Error("Trạng thái không hợp lệ.");

    }

    return updateRecord(

      makeKey(context),

      function(record) {

        if (!record) {

          throw new Error("Không tìm thấy bản nháp.");

        }

        record.status = status;

        return record;

      }

    );

  }


  /* =====================================================
     09. LƯU TỰ ĐỘNG

     Lưu thiết bị ngay.
     Hẹn đồng bộ sau 5 giây.
     API adapter sẽ được bổ sung ở giai đoạn 7.8.
  ===================================================== */

  async function autosave(context, data, onSync) {

    const record = await saveLocal(context, data);

    scheduleSync(context, onSync);

    return record;

  }


  function scheduleSync(context, onSync) {

    const key = makeKey(context);

    if (timers.has(key)) {

      clearTimeout(timers.get(key));

      timers.delete(key);

    }

    if (typeof onSync !== "function") return;

    const timer = setTimeout(function() {

      timers.delete(key);

      if (!navigator.onLine) return;

      const previous = queues.get(key) ||

        Promise.resolve();

      const next = previous

        .catch(function() {})

        .then(async function() {

          const latest = await restoreLocal(context);

          if (latest && latest.dirty) {

            await onSync(latest);

          }

        });

      queues.set(key, next);

      next.catch(function(error) {

        console.warn(

          "Chưa đồng bộ được bản nháp:",

          error.message

        );

      }).finally(function() {

        if (queues.get(key) === next) {

          queues.delete(key);

        }

      });

    }, CONFIG.AUTOSAVE_MS);

    timers.set(key, timer);

  }


  /* =====================================================
     10. XÓA BẢN NHÁP ĐÃ ĐỒNG BỘ

     Không tự động xóa dữ liệu chưa đồng bộ.
  ===================================================== */

  async function clearLocal(context) {

    const key = makeKey(context);

    const db = await openDatabase();

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(

        CONFIG.STORE_NAME, "readwrite"

      );

      const store = tx.objectStore(CONFIG.STORE_NAME);

      const request = store.get(key);

      let failure;

      request.onsuccess = function() {

        const record = request.result;

        if (record && record.dirty) {

          failure = new Error(

            "Không xóa bản nháp chưa đồng bộ."

          );

          tx.abort();

          return;

        }

        store.delete(key);

      };

      tx.oncomplete = function() {

        resolve(true);

      };

      tx.onerror = function() {

        reject(failure || tx.error);

      };

      tx.onabort = function() {

        reject(failure || tx.error);

      };

    });

  }


  /* =====================================================
     11. KIỂM TRA DUNG LƯỢNG THIẾT BỊ
  ===================================================== */

  async function getStorageInfo() {

    if (

      navigator.storage &&

      navigator.storage.estimate

    ) {

      return navigator.storage.estimate();

    }

    return {

      usage: null,

      quota: null

    };

  }


  /* =====================================================
     12. KIỂM THỬ LƯU TRỮ TRÌNH DUYỆT
  ===================================================== */

  async function selfTest() {

    const context = {

      date: "2026-11-25",

      branch: "CS1",

      shift: "TOI",

      department: "BEP_PHO",

      employee: "TEST_" + createId()

        .replace(/-/g, "")

        .slice(0, 10)

        .toUpperCase()

    };

    let passed = 0;

    const results = [];

    function check(name, condition) {

      if (!condition) {

        throw new Error(name);

      }

      passed++;

      results.push("ĐẠT " + passed + " - " + name);

    }

    try {

      await openDatabase();

      check("Mở IndexedDB", true);

      const data = emptyFields();

      data.inventory.KK001 = {

        remaining: 0,

        waste: 0

      };

      data.checklist.CL001 = true;

      const saved = await saveLocal(context, data);

      check("Lưu bản nháp", saved.dirty === true);

      const restored = await restoreLocal(context);

      check(

        "Khôi phục số lượng 0",

        restored.data.inventory.KK001.remaining === 0

      );

      check(

        "Khôi phục checklist",

        restored.data.checklist.CL001 === true

      );

      // Tạo ảnh JPEG nhỏ thực tế bằng canvas.

      const canvas = document.createElement("canvas");

      canvas.width = 32;

      canvas.height = 32;

      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#941c1c";

      ctx.fillRect(0, 0, 32, 32);

      const jpeg = canvas.toDataURL("image/jpeg", 0.8);

      await savePhotoLocal(context, "HA001", jpeg);

      const withPhoto = await restoreLocal(context);

      check(

        "Lưu và khôi phục ảnh",

        withPhoto.photos.HA001.data === jpeg

      );

      let rejected = false;

      try {

        await clearLocal(context);

      } catch (error) {

        rejected = true;

      }

      check("Bảo vệ dữ liệu chưa đồng bộ", rejected);

      const oldRevision = withPhoto.localRevision;

      data.generalNote = "Thay đổi mới";

      await saveLocal(context, data);

      await markSynced(context, 1, oldRevision);

      const newer = await restoreLocal(context);

      check(

        "Không làm mất thay đổi mới",

        newer.dirty === true

      );

      await markSynced(

        context, 2, newer.localRevision

      );

      const synced = await restoreLocal(context);

      check(

        "Ghi nhận đồng bộ mô phỏng",

        synced.dirty === false

      );

      await setStatus(context, "FINALIZED");

      rejected = false;

      try {

        await saveLocal(context, data);

      } catch (error) {

        rejected = true;

      }

      check("Khóa bản nháp đã chốt", rejected);

      await clearLocal(context);

      check(

        "Dọn dữ liệu kiểm thử",

        (await restoreLocal(context)) === null

      );

      return {

        success: true,

        passed: passed,

        total: 10,

        results: results

      };

    } catch (error) {

      return {

        success: false,

        passed: passed,

        total: 10,

        error: error.message,

        results: results

      };

    }

  }


  /* =====================================================
     13. XUẤT MODULE
  ===================================================== */

  global.PGDDraft = Object.freeze({

    config: CONFIG,

    createId: createId,

    getDeviceId: getDeviceId,

    makeKey: makeKey,

    openDatabase: openDatabase,

    saveLocal: saveLocal,

    savePhotoLocal: savePhotoLocal,

    removePhotoLocal: removePhotoLocal,

    restoreLocal: restoreLocal,

    autosave: autosave,

    scheduleSync: scheduleSync,

    markSynced: markSynced,

    setStatus: setStatus,

    clearLocal: clearLocal,

    getStorageInfo: getStorageInfo,

    selfTest: selfTest

  });

})(window);
