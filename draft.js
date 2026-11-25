/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.5.2
 * LƯU BẢN NHÁP TRÊN THIẾT BỊ
 * IndexedDB
 ************************************************************/

(function(global) {

  "use strict";

  const CONFIG = Object.freeze({

    VERSION: "7.5.2",
    CATALOG_REVISION: "751",

    DB_NAME: "PGD_OPERATION_V2",
    DB_VERSION: 2,

    STORE_NAME: "drafts",
    BACKUP_STORE: "draft_backups",

    DEVICE_KEY: "PGD_V2_DEVICE_ID",

    AUTOSAVE_MS: 5000,
    MAX_PHOTO_LENGTH: 750000

  });

  const CATALOG = Object.freeze({

    BEP_PHO: {
      inventory: [
        "KK001", "KK042", "KK002",
        "KK003", "KK043"
      ],
      supplies: []
    },

    BEP_VAT_TU: {
      inventory: [
        "KK006", "KK005"
      ],
      supplies: [
        "KK007", "KK008", "KK009",
        "KK010", "KK011", "KK012",
        "KK013", "KK014", "KK015",
        "KK016", "KK017", "KK018"
      ]
    },

    CHAY_BAN: {
      inventory: [
        "KK020", "KK021", "KK022",
        "KK023", "KK024", "KK004"
      ],
      supplies: [
        "KK044", "KK025", "KK028",
        "KK029", "KK030", "KK031",
        "KK032", "KK033", "KK034",
        "KK035", "KK036"
      ]
    },

    VE_SINH: {
      inventory: [],
      supplies: [
        "KK037", "KK038", "KK039",
        "KK040", "KK041"
      ]
    },

    TRUONG_CA: {
      inventory: [],
      supplies: []
    }

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

      throw new Error(
        "Trình duyệt không hỗ trợ mã định danh."
      );

    }

    const bytes = new Uint8Array(16);

    global.crypto.getRandomValues(bytes);

    return Array.from(bytes)

      .map(b => b.toString(16).padStart(2, "0"))

      .join("");

  }


  function getDeviceId() {

    let id = localStorage.getItem(
      CONFIG.DEVICE_KEY
    );

    if (!id) {

      id = createId();

      localStorage.setItem(
        CONFIG.DEVICE_KEY,
        id
      );

    }

    return id;
  }


  function makeKey(context) {

    if (!context) {

      throw new Error(
        "Thiếu thông tin bản nháp."
      );

    }

    const date = String(context.date || "");
    const branch = String(context.branch || "");
    const shift = String(context.shift || "");
    const department = String(context.department || "");
    const employee = String(context.employee || "");

    const parsed = new Date(date + "T12:00:00Z");

    if (

      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||

      isNaN(parsed.getTime()) ||

      parsed.toISOString().slice(0, 10) !== date ||

      !["CS1", "CS2"].includes(branch) ||

      !["SANG", "TOI", "DEM"].includes(shift) ||

      !Object.prototype.hasOwnProperty.call(
        CATALOG, department
      ) ||

      !/^[A-Z0-9_-]{2,24}$/.test(employee)

    ) {

      throw new Error(
        "Thông tin bản nháp không hợp lệ."
      );

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

        reject(new Error(
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

          const store = db.createObjectStore(
            CONFIG.STORE_NAME,
            {keyPath: "key"}
          );

          store.createIndex(
            "updatedAt",
            "updatedAt"
          );

        }

        if (
          !db.objectStoreNames.contains(
            CONFIG.BACKUP_STORE
          )
        ) {

          const backups = db.createObjectStore(
            CONFIG.BACKUP_STORE,
            {keyPath: "backupId"}
          );

          backups.createIndex(
            "draftKey",
            "draftKey"
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

        reject(new Error(
          "Hãy đóng các tab báo cáo cũ rồi mở lại."
        ));

      };

    }).catch(function(error) {

      dbPromise = null;
      throw error;

    });

    return dbPromise;
  }


  /* =====================================================
     03. HÀM HỖ TRỢ DỮ LIỆU
  ===================================================== */

  function clone(value) {

    return JSON.parse(
      JSON.stringify(value)
    );

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

      catalogRevision: CONFIG.CATALOG_REVISION,

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
      !["DRAFT", "REJECTED"].includes(
        record.status
      )
    ) {

      throw new Error(
        "Bản nháp đã bị khóa."
      );

    }

  }


  function touch(record) {

    record.localRevision++;

    record.updatedAt = new Date().toISOString();

    record.dirty = true;

    return record;
  }


  function wasteSignature(fields) {

    const inventory = fields.inventory || {};

    return JSON.stringify(

      Object.keys(inventory)

        .sort()

        .filter(
          id => Number(inventory[id].waste) > 0
        )

        .map(
          id => [id, inventory[id].waste]
        )

    );

  }


  function removeWasteEvidence(record) {

    record.data.wasteNote = "";

    Object.keys(record.photos || {})
      .forEach(function(id) {

        if (!id.startsWith("WASTE_")) return;

        delete record.photos[id];

        if (!record.removedPhotos.includes(id)) {

          record.removedPhotos.push(id);

        }

      });

  }


  /* =====================================================
     04. KIỂM TRA DANH MỤC TRÊN THIẾT BỊ
  ===================================================== */

  function validateFields(context, data) {

    const catalog = CATALOG[context.department];

    if (!catalog) {

      throw new Error(
        "Bộ phận không hợp lệ."
      );

    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {

      throw new Error(
        "Dữ liệu bản nháp không hợp lệ."
      );

    }

    const fields = Object.assign(
      emptyFields(),
      clone(data)
    );

    Object.keys(fields).forEach(function(key) {

      if (
        ![
          "inventory",
          "supplies",
          "checklist",
          "wasteNote",
          "generalNote"
        ].includes(key)
      ) {

        throw new Error(
          "Trường dữ liệu không hợp lệ: " + key
        );

      }

    });

    ["inventory", "supplies", "checklist"]
      .forEach(function(key) {

        if (
          !fields[key] ||
          typeof fields[key] !== "object" ||
          Array.isArray(fields[key])
        ) {

          throw new Error(
            "Sai cấu trúc: " + key
          );

        }

      });

    Object.keys(fields.inventory)
      .forEach(function(id) {

        if (!catalog.inventory.includes(id)) {

          throw new Error(
            "Sai mã kiểm kê: " + id
          );

        }

        const value = fields.inventory[id];

        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {

          throw new Error(
            "Sai số lượng: " + id
          );

        }

        if (value.remaining === undefined ||
            value.remaining === "") {

          value.remaining = null;

        }

        if (value.waste === undefined) {

          value.waste = 0;

        }

        ["remaining", "waste"]
          .forEach(function(key) {

            const quantity = value[key];

            if (quantity === null) return;

            if (

              typeof quantity !== "number" ||

              !Number.isFinite(quantity) ||

              quantity < 0 ||

              quantity > 100000

            ) {

              throw new Error(
                "Số lượng không hợp lệ: " + id
              );

            }

            const decimalIds = [
              "KK002", "KK003",
              "KK005", "KK006"
            ];

            if (
              !decimalIds.includes(id) &&
              !Number.isInteger(quantity)
            ) {

              throw new Error(
                "Hạng mục phải nhập số nguyên: " + id
              );

            }

          });

      });

    Object.keys(fields.supplies)
      .forEach(function(id) {

        if (!catalog.supplies.includes(id)) {

          throw new Error(
            "Sai mã vật tư: " + id
          );

        }

        if (

          !["", "Còn", "Gần hết", "Hết"]
            .includes(fields.supplies[id])

        ) {

          throw new Error(
            "Sai trạng thái vật tư."
          );

        }

      });

    ["wasteNote", "generalNote"]
      .forEach(function(key) {

        if (

          typeof fields[key] !== "string" ||

          fields[key].length > 1000

        ) {

          throw new Error(
            "Ghi chú không hợp lệ."
          );

        }

      });

    const checklistRanges = {

      BEP_PHO: [1, 7],
      BEP_VAT_TU: [8, 15],
      CHAY_BAN: [16, 23],
      VE_SINH: [24, 32],
      TRUONG_CA: [33, 47]

    };

    const range = checklistRanges[
      context.department
    ];

    Object.keys(fields.checklist)
      .forEach(function(id) {

        const number = Number(id.slice(2));

        if (

          !/^CL\d{3}$/.test(id) ||

          number < range[0] ||

          number > range[1] ||

          typeof fields.checklist[id] !== "boolean"

        ) {

          throw new Error(
            "Checklist không hợp lệ: " + id
          );

        }

      });

    return fields;
  }


  /* =====================================================
     05. CHUYỂN ĐỔI BẢN NHÁP CŨ
  ===================================================== */

  function migrateRecord(record, backupStore) {

    if (!record) return null;

    if (
      record.catalogRevision ===
      CONFIG.CATALOG_REVISION
    ) {

      return record;

    }

    // Không thay đổi bản nháp đã khóa.

    if (
      !["DRAFT", "REJECTED"].includes(
        record.status
      )
    ) {

      return record;

    }

    // Không tự đặt lại phiên bản của bản nháp
    // đã từng đồng bộ với máy chủ.

    if (Number(record.serverVersion || 0) > 0) {

      throw new Error(
        "Bản nháp cũ đã từng đồng bộ. " +
        "Cần quản lý kiểm tra trước khi chuyển đổi."
      );

    }

    // Sao lưu đầy đủ nội dung và ảnh cũ.
    // Sao lưu và chuyển đổi trong cùng transaction.

    backupStore.put({

      backupId: createId(),

      draftKey: record.key,

      reason: "CATALOG_MIGRATION_751",

      backedUpAt: new Date().toISOString(),

      record: clone(record)

    });

    const oldFields = record.data || emptyFields();

    const oldWasteSignature =
      wasteSignature(oldFields);

    const department = record.context.department;

    const catalog = CATALOG[department];

    if (!catalog) {

      throw new Error(
        "Không xác định được bộ phận bản nháp."
      );

    }

    const clean = emptyFields();

    const removedItems = [];

    Object.keys(oldFields.inventory || {})
      .forEach(function(id) {

        if (catalog.inventory.includes(id)) {

          clean.inventory[id] =
            oldFields.inventory[id];

        } else {

          removedItems.push(id);

        }

      });

    Object.keys(oldFields.supplies || {})
      .forEach(function(id) {

        if (catalog.supplies.includes(id)) {

          clean.supplies[id] =
            oldFields.supplies[id];

        } else {

          removedItems.push(id);

        }

      });

    clean.checklist = clone(
      oldFields.checklist || {}
    );

    clean.generalNote =
      oldFields.generalNote || "";

    clean.wasteNote =
      oldFields.wasteNote || "";

    record.data = validateFields(
      record.context,
      clean
    );

    record.photos = record.photos || {};

    record.removedPhotos =
      record.removedPhotos || [];

    if (

      oldWasteSignature !==
        wasteSignature(record.data) ||

      !Object.values(record.data.inventory)
        .some(item => Number(item.waste) > 0)

    ) {

      removeWasteEvidence(record);

    }

    record.catalogRevision =
      CONFIG.CATALOG_REVISION;

    record.migrationInfo = {

      migratedAt: new Date().toISOString(),

      removedItems: removedItems,

      backupAvailable: true

    };

    return touch(record);

  }


  /* =====================================================
     06. THAO TÁC LƯU TRỮ
  ===================================================== */

  async function readRecord(key) {

    const db = await openDatabase();

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(
        CONFIG.STORE_NAME,
        "readonly"
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

        [
          CONFIG.STORE_NAME,
          CONFIG.BACKUP_STORE
        ],

        "readwrite"

      );

      const store = tx.objectStore(
        CONFIG.STORE_NAME
      );

      const backupStore = tx.objectStore(
        CONFIG.BACKUP_STORE
      );

      const request = store.get(key);

      let result;
      let failure;

      request.onsuccess = function() {

        try {

          const old = migrateRecord(
            request.result || null,
            backupStore
          );

          result = updater(old);

          if (result) {

            store.put(result);

          }

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

        reject(
          failure ||
          tx.error ||
          new Error("Không lưu được bản nháp.")
        );

      };

    });

  }


  /* =====================================================
     07. LƯU NỘI DUNG
  ===================================================== */

  async function saveLocal(context, data) {

    const key = makeKey(context);

    const fields = validateFields(
      context, data
    );

    return updateRecord(key, function(old) {

      const record = old || newRecord(context);

      assertEditable(record);

      const previousSignature =
        wasteSignature(record.data);

      record.data = fields;

      if (

        previousSignature !==
        wasteSignature(fields)

      ) {

        removeWasteEvidence(record);

      }

      return touch(record);

    });

  }


  /* =====================================================
     08. LƯU TỪNG NHÓM DỮ LIỆU
     Tránh ghi đè checklist và kiểm kê của nhau.
  ===================================================== */

  async function saveFieldsLocal(context, patch) {

    const key = makeKey(context);

    if (
      !patch ||
      typeof patch !== "object" ||
      Array.isArray(patch)
    ) {

      throw new Error(
        "Dữ liệu cập nhật không hợp lệ."
      );

    }

    const changes = clone(patch);

    return updateRecord(key, function(old) {

      const record = old || newRecord(context);

      assertEditable(record);

      const previousSignature =
        wasteSignature(record.data);

      record.data = validateFields(

        context,

        Object.assign(
          {},
          record.data,
          changes
        )

      );

      if (

        previousSignature !==
        wasteSignature(record.data)

      ) {

        removeWasteEvidence(record);

      }

      return touch(record);

    });

  }


  /* =====================================================
     09. KIỂM TRA MÃ ẢNH
  ===================================================== */

  function validatePhotoId(context, photoId) {

    const ranges = {

      BEP_PHO: [1, 2],
      BEP_VAT_TU: [3, 5],
      CHAY_BAN: [6, 7],
      VE_SINH: [8, 9],
      TRUONG_CA: [10, 14]

    };

    const range = ranges[context.department];

    const number = Number(photoId.slice(2));

    const normal =

      /^HA\d{3}$/.test(photoId) &&

      number >= range[0] &&

      number <= range[1];

    const waste =

      /^WASTE_0[1-5]$/.test(photoId) &&

      CATALOG[context.department]
        .inventory.length > 0;

    if (!normal && !waste) {

      throw new Error(
        "Mã ảnh không thuộc bộ phận."
      );

    }

  }


  /* =====================================================
     10. LƯU HÌNH ẢNH
  ===================================================== */

  async function savePhotoLocal(
    context,
    photoId,
    data
  ) {

    const key = makeKey(context);

    validatePhotoId(context, photoId);

    if (

      typeof data !== "string" ||

      !data.startsWith("data:image/jpeg;base64,") ||

      data.length > CONFIG.MAX_PHOTO_LENGTH

    ) {

      throw new Error(
        "Hình ảnh không hợp lệ."
      );

    }

    return updateRecord(key, function(old) {

      const record = old || newRecord(context);

      assertEditable(record);

      if (photoId.startsWith("WASTE_")) {

        const hasWaste = Object.values(
          record.data.inventory || {}
        ).some(
          item => Number(item.waste) > 0
        );

        if (!hasWaste) {

          throw new Error(
            "Chưa có hàng hủy cần minh chứng."
          );

        }

      }

      record.photos[photoId] = {

        data: data,

        dirty: true,

        updatedAt: new Date().toISOString()

      };

      record.removedPhotos =
        record.removedPhotos.filter(
          id => id !== photoId
        );

      return touch(record);

    });

  }


  /* =====================================================
     11. XÓA LIÊN KẾT ẢNH
  ===================================================== */

  async function removePhotoLocal(
    context,
    photoId
  ) {

    const key = makeKey(context);

    validatePhotoId(context, photoId);

    return updateRecord(key, function(record) {

      if (!record) {

        throw new Error(
          "Không tìm thấy bản nháp."
        );

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
     12. KHÔI PHỤC BẢN NHÁP
  ===================================================== */

  async function restoreLocal(context) {

    const key = makeKey(context);

    const record = await readRecord(key);

    if (!record) return null;

    if (

      record.catalogRevision !==
        CONFIG.CATALOG_REVISION &&

      ["DRAFT", "REJECTED"].includes(record.status)

    ) {

      return updateRecord(key, function(old) {
        return old;
      });

    }

    return record;
  }


  /* =====================================================
     13. XEM BẢN SAO LƯU CŨ
  ===================================================== */

  async function listBackups(context) {

    const key = makeKey(context);

    const db = await openDatabase();

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(
        CONFIG.BACKUP_STORE,
        "readonly"
      );

      const index = tx.objectStore(
        CONFIG.BACKUP_STORE
      ).index("draftKey");

      const request = index.getAll(key);

      request.onsuccess = function() {

        resolve(request.result || []);

      };

      request.onerror = function() {

        reject(request.error);

      };

    });

  }


  /* =====================================================
     14. GHI NHẬN ĐỒNG BỘ
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

      throw new Error(
        "Phiên bản máy chủ không hợp lệ."
      );

    }

    return updateRecord(

      makeKey(context),

      function(record) {

        if (!record) {

          throw new Error(
            "Không tìm thấy bản nháp."
          );

        }

        if (serverVersion < record.serverVersion) {

          throw new Error(
            "Phản hồi máy chủ đã cũ."
          );

        }

        record.serverVersion = serverVersion;

        record.syncedAt =
          new Date().toISOString();

        if (
          record.localRevision === sentRevision
        ) {

          record.dirty = false;
          record.removedPhotos = [];

          Object.values(record.photos)
            .forEach(function(photo) {

              photo.dirty = false;

            });

        }

        return record;

      }

    );

  }


  /* =====================================================
     15. KHÓA BẢN NHÁP
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

      throw new Error(
        "Trạng thái không hợp lệ."
      );

    }

    return updateRecord(

      makeKey(context),

      function(record) {

        if (!record) {

          throw new Error(
            "Không tìm thấy bản nháp."
          );

        }

        record.status = status;

        return record;

      }

    );

  }


  /* =====================================================
     16. TỰ ĐỘNG LƯU
  ===================================================== */

  async function autosave(
    context,
    data,
    onSync
  ) {

    const record = await saveLocal(
      context,
      data
    );

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

          if (

            latest &&

            latest.dirty &&

            ["DRAFT", "REJECTED"]
              .includes(latest.status)

          ) {

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
     17. XÓA BẢN NHÁP ĐÃ ĐỒNG BỘ
  ===================================================== */

  async function clearLocal(context) {

    const key = makeKey(context);

    const db = await openDatabase();

    return new Promise(function(resolve, reject) {

      const tx = db.transaction(
        CONFIG.STORE_NAME,
        "readwrite"
      );

      const store = tx.objectStore(
        CONFIG.STORE_NAME
      );

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
     18. KIỂM TRA DUNG LƯỢNG
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
     19. KIỂM THỬ TRÌNH DUYỆT - 10 BÀI
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

      results.push(
        "ĐẠT " + passed + " - " + name
      );

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

      const saved = await saveLocal(
        context, data
      );

      check(
        "Lưu bản nháp",
        saved.dirty === true
      );

      const restored = await restoreLocal(context);

      check(
        "Khôi phục số lượng 0",
        restored.data.inventory.KK001.remaining === 0
      );

      check(
        "Khôi phục checklist",
        restored.data.checklist.CL001 === true
      );

      const canvas = document.createElement("canvas");

      canvas.width = 32;
      canvas.height = 32;

      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#941c1c";

      ctx.fillRect(0, 0, 32, 32);

      const jpeg = canvas.toDataURL(
        "image/jpeg", 0.8
      );

      await savePhotoLocal(
        context,
        "HA001",
        jpeg
      );

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

      check(
        "Bảo vệ dữ liệu chưa đồng bộ",
        rejected
      );

      const oldRevision = withPhoto.localRevision;

      data.generalNote = "Thay đổi mới";

      await saveLocal(context, data);

      await markSynced(
        context, 1, oldRevision
      );

      const newer = await restoreLocal(context);

      check(
        "Không làm mất thay đổi mới",
        newer.dirty === true
      );

      await markSynced(
        context,
        2,
        newer.localRevision
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

      check(
        "Khóa bản nháp đã chốt",
        rejected
      );

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
     20. KIỂM THỬ DANH MỤC MỚI - 6 BÀI
  ===================================================== */

  async function selfTest752() {

    const context = {

      date: "2026-11-25",
      branch: "CS1",
      shift: "TOI",
      department: "BEP_PHO",

      employee: "T752_" + createId()
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

      results.push(
        "ĐẠT " + passed + " - " + name
      );

    }

    try {

      let numeric = 0;
      let status = 0;

      Object.values(CATALOG)
        .forEach(function(department) {

          numeric += department.inventory.length;

          status += department.supplies.length;

        });

      check(
        "Danh mục 13 số lượng và 28 trạng thái",
        numeric === 13 && status === 28
      );

      // Tạo bản nháp cũ mô phỏng.

      const old = newRecord(context);

      delete old.catalogRevision;

      old.data.inventory.KK001 = {
        remaining: 5,
        waste: 0
      };

      old.data.inventory.KK004 = {
        remaining: 10,
        waste: 2
      };

      old.data.wasteNote = "Quẩy hủy";

      const db = await openDatabase();

      await new Promise(function(resolve, reject) {

        const tx = db.transaction(
          CONFIG.STORE_NAME,
          "readwrite"
        );

        tx.objectStore(
          CONFIG.STORE_NAME
        ).put(old);

        tx.oncomplete = resolve;

        tx.onerror = function() {
          reject(tx.error);
        };

        tx.onabort = function() {
          reject(tx.error);
        };

      });

      const migrated = await restoreLocal(context);

      check(
        "Chuyển đổi bản nháp cũ",
        migrated.catalogRevision === "751" &&
        migrated.data.inventory.KK001.remaining === 5 &&
        !migrated.data.inventory.KK004
      );

      const backups = await listBackups(context);

      check(
        "Bảo toàn dữ liệu bản nháp cũ",
        backups.length === 1 &&
        backups[0].record.data.inventory.KK004
          .remaining === 10
      );

      check(
        "Xóa giải trình không còn phù hợp",
        migrated.data.wasteNote === ""
      );

      let rejected = false;

      try {

        await saveFieldsLocal(context, {

          inventory: {
            KK004: {
              remaining: 3,
              waste: 0
            }
          }

        });

      } catch (error) {

        rejected = true;

      }

      check(
        "Chặn mã kiểm kê sai bộ phận",
        rejected
      );

      await saveFieldsLocal(context, {

        inventory: {
          KK001: {remaining: 5, waste: 1},
          KK042: {remaining: 3, waste: 0},
          KK043: {remaining: 10, waste: 0}
        }

      });

      await saveFieldsLocal(context, {
        wasteNote: "Kiểm thử hàng hủy"
      });

      const canvas = document.createElement("canvas");

      canvas.width = 32;
      canvas.height = 32;

      const ctx = canvas.getContext("2d");

      ctx.fillRect(0, 0, 32, 32);

      await savePhotoLocal(

        context,

        "WASTE_01",

        canvas.toDataURL("image/jpeg", 0.8)

      );

      await saveFieldsLocal(context, {

        inventory: {
          KK001: {remaining: 5, waste: 2},
          KK042: {remaining: 3, waste: 0},
          KK043: {remaining: 10, waste: 0}
        }

      });

      const changed = await restoreLocal(context);

      check(
        "Thay đổi hàng hủy vô hiệu hóa ảnh cũ",
        !changed.photos.WASTE_01 &&
        changed.data.wasteNote === ""
      );

      // Chỉ dọn bản nháp kiểm thử.
      // Không tác động dữ liệu nhân viên.

      await markSynced(
        context,
        1,
        changed.localRevision
      );

      await clearLocal(context);

      return {

        success: true,
        passed: passed,
        total: 6,
        results: results

      };

    } catch (error) {

      return {

        success: false,
        passed: passed,
        total: 6,
        error: error.message,
        results: results

      };

    }

  }


  /* =====================================================
     21. XUẤT MODULE
  ===================================================== */

  global.PGDDraft = Object.freeze({

    config: CONFIG,

    createId: createId,
    getDeviceId: getDeviceId,
    makeKey: makeKey,

    openDatabase: openDatabase,

    saveLocal: saveLocal,
    saveFieldsLocal: saveFieldsLocal,

    savePhotoLocal: savePhotoLocal,
    removePhotoLocal: removePhotoLocal,

    restoreLocal: restoreLocal,
    listBackups: listBackups,

    autosave: autosave,
    scheduleSync: scheduleSync,

    markSynced: markSynced,
    setStatus: setStatus,

    clearLocal: clearLocal,

    getStorageInfo: getStorageInfo,

    selfTest: selfTest,
    selfTest752: selfTest752

  });

})(window);

/************************************************************
 * KẾT THÚC DRAFT.JS
 ************************************************************/
