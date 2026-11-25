
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.5.3
 * MODULE GIAO DIỆN KIỂM KÊ
 * CATALOG REVISION: 751
 * YÊU CẦU: draft.js 7.5.2
 ************************************************************/

(function (global) {

  "use strict";

  /* ======================================================
     01. CẤU HÌNH
  ====================================================== */

  const CONFIG = Object.freeze({
    VERSION: "7.5.3",
    CATALOG_REVISION: "751",
    TOTAL_ITEMS: 41,
    NUMBER_ITEMS: 13,
    STATUS_ITEMS: 28,
    MAX_QUANTITY: 100000,
    MAX_NOTE_LENGTH: 1000,
    MIN_WASTE_PHOTOS: 1,
    MAX_WASTE_PHOTOS: 5,
    MAX_PHOTO_LENGTH: 750000,
    PHOTO_WIDTH: 1000,
    STATUSES: ["Còn", "Gần hết", "Hết"],
    DEPARTMENTS: {
      BEP_PHO: 5,
      BEP_VAT_TU: 14,
      CHAY_BAN: 17,
      VE_SINH: 5,
      TRUONG_CA: 0
    }
  });

  const DEPARTMENT_NAMES = {
    BEP_PHO: "Bếp phở",
    BEP_VAT_TU: "Bếp vật tư + dọn dẹp",
    CHAY_BAN: "Chạy bàn + vật tư nguyên liệu",
    VE_SINH: "Vệ sinh chung",
    TRUONG_CA: "Trưởng ca"
  };

  const BRANCH_NAMES = {
    CS1: "28 Võ Chí Công",
    CS2: "An Khánh"
  };

  const SHIFT_NAMES = {
    SANG: "Ca sáng",
    TOI: "Ca tối",
    DEM: "Ca đêm"
  };


  /* ======================================================
     02. DANH MỤC KIỂM KÊ CHÍNH THỨC
  ====================================================== */

  const ROWS = [

    // BẾP PHỞ - 5 HẠNG MỤC

    ["KK001", "BEP_PHO",
      "Gà sống chưa chế biến", "Con", "NUMBER"],

    ["KK042", "BEP_PHO",
      "Gà đã luộc và chế biến", "Con", "NUMBER"],

    ["KK002", "BEP_PHO",
      "Bánh phở", "Kg", "NUMBER"],

    ["KK003", "BEP_PHO",
      "Nước dùng", "Lít", "NUMBER"],

    ["KK043", "BEP_PHO",
      "Trứng chần", "Quả", "NUMBER"],


    // BẾP VẬT TƯ - 14 HẠNG MỤC

    ["KK006", "BEP_VAT_TU",
      "Măng ngâm", "Kg", "NUMBER"],

    ["KK005", "BEP_VAT_TU",
      "Hành rau thơm", "Kg", "NUMBER"],

    ["KK007", "BEP_VAT_TU",
      "Chanh quất", "", "STATUS"],

    ["KK008", "BEP_VAT_TU",
      "Ớt tươi", "", "STATUS"],

    ["KK009", "BEP_VAT_TU",
      "Giấm", "", "STATUS"],

    ["KK010", "BEP_VAT_TU",
      "Nước mắm", "", "STATUS"],

    ["KK011", "BEP_VAT_TU",
      "Tương ớt", "", "STATUS"],

    ["KK012", "BEP_VAT_TU",
      "Muối bột canh", "", "STATUS"],

    ["KK013", "BEP_VAT_TU",
      "Mì chính", "", "STATUS"],

    ["KK014", "BEP_VAT_TU",
      "Gừng", "", "STATUS"],

    ["KK015", "BEP_VAT_TU",
      "Hành khô", "", "STATUS"],

    ["KK016", "BEP_VAT_TU",
      "Hạt tiêu", "", "STATUS"],

    ["KK017", "BEP_VAT_TU",
      "Găng tay", "", "STATUS"],

    ["KK018", "BEP_VAT_TU",
      "Nước rửa bát", "", "STATUS"],


    // CHẠY BÀN - 17 HẠNG MỤC

    ["KK020", "CHAY_BAN",
      "Coca", "Lon", "NUMBER"],

    ["KK021", "CHAY_BAN",
      "Nước cam", "Lon", "NUMBER"],

    ["KK022", "CHAY_BAN",
      "Bia", "Lon", "NUMBER"],

    ["KK023", "CHAY_BAN",
      "Bò húc", "Lon", "NUMBER"],

    ["KK024", "CHAY_BAN",
      "Nước lọc đóng chai", "Chai", "NUMBER"],

    ["KK004", "CHAY_BAN",
      "Quẩy", "Cái", "NUMBER"],

    ["KK044", "CHAY_BAN",
      "Trà", "", "STATUS"],

    ["KK025", "CHAY_BAN",
      "Đá lạnh", "", "STATUS"],

    ["KK028", "CHAY_BAN",
      "Giấy ăn", "", "STATUS"],

    ["KK029", "CHAY_BAN",
      "Tăm", "", "STATUS"],

    ["KK030", "CHAY_BAN",
      "Hộp đựng phở", "", "STATUS"],

    ["KK031", "CHAY_BAN",
      "Túi đựng nước dùng", "", "STATUS"],

    ["KK032", "CHAY_BAN",
      "Túi nilon mang về", "", "STATUS"],

    ["KK033", "CHAY_BAN",
      "Đũa dùng một lần", "", "STATUS"],

    ["KK034", "CHAY_BAN",
      "Thìa dùng một lần", "", "STATUS"],

    ["KK035", "CHAY_BAN",
      "Hộp đựng gà chặt", "", "STATUS"],

    ["KK036", "CHAY_BAN",
      "Hộp đựng gia vị", "", "STATUS"],


    // VỆ SINH CHUNG - 5 HẠNG MỤC

    ["KK037", "VE_SINH",
      "Giấy vệ sinh", "", "STATUS"],

    ["KK038", "VE_SINH",
      "Nước lau sàn", "", "STATUS"],

    ["KK039", "VE_SINH",
      "Nước rửa tay", "", "STATUS"],

    ["KK040", "VE_SINH",
      "Túi đựng rác", "", "STATUS"],

    ["KK041", "VE_SINH",
      "Nước tẩy nhà vệ sinh", "", "STATUS"]

  ];

  const CATALOG = ROWS.map(function (row) {
    return Object.freeze({
      id: row[0],
      department: row[1],
      name: row[2],
      unit: row[3],
      type: row[4],
      wasteAllowed: row[4] === "NUMBER"
    });
  });


  /* ======================================================
     03. HÀM HỖ TRỢ
  ====================================================== */

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function element(tag, className, text) {

    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  function getCatalog(department) {

    assert(
      Object.prototype.hasOwnProperty.call(
        CONFIG.DEPARTMENTS,
        department
      ),
      "Bộ phận không hợp lệ."
    );

    return clone(
      CATALOG.filter(function (item) {
        return item.department === department;
      })
    );
  }

  function validateCatalog(department, catalog) {

    assert(
      Array.isArray(catalog),
      "Danh mục kiểm kê không hợp lệ."
    );

    const expected = getCatalog(department);

    assert(
      catalog.length === expected.length,
      "Sai số lượng hạng mục kiểm kê."
    );

    const ids = new Set();

    catalog.forEach(function (item) {

      assert(
        item && typeof item.id === "string",
        "Thiếu mã kiểm kê."
      );

      assert(
        !ids.has(item.id),
        "Trùng mã kiểm kê."
      );

      ids.add(item.id);

      const original = expected.find(function (row) {
        return row.id === item.id;
      });

      assert(
        original &&
        item.department === department &&
        item.type === original.type &&
        item.unit === original.unit &&
        item.name === original.name,
        "Danh mục không khớp phiên bản 751: " + item.id
      );

    });

    return expected;
  }

  function allowsDecimal(item) {
    return ["Kg", "Lít"].includes(item.unit);
  }

  function validQuantity(value, item) {

    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= CONFIG.MAX_QUANTITY &&
      (
        allowsDecimal(item) ||
        Number.isInteger(value)
      )
    );
  }

  function parseQuantity(raw, item) {

    if (raw === "") return null;

    const value = Number(raw);

    assert(
      validQuantity(value, item),
      allowsDecimal(item)
        ? "Nhập số từ 0 đến 100.000."
        : "Nhập số nguyên từ 0 đến 100.000."
    );

    return value;
  }

  function wasteSignature(inventory) {

    return JSON.stringify(
      Object.keys(inventory)
        .sort()
        .filter(function (id) {
          return Number(inventory[id].waste) > 0;
        })
        .map(function (id) {
          return [id, inventory[id].waste];
        })
    );
  }


  /* ======================================================
     04. XỬ LÝ HÌNH ẢNH
  ====================================================== */

  function loadImage(file) {

    return new Promise(function (resolve, reject) {

      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error(
          "Không đọc được hình ảnh."
        ));
      };

      image.src = url;

    });
  }

  function formatTime() {

    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());
  }

  async function processPhoto(file, context, photoId) {

    assert(file, "Chưa chọn hình ảnh.");

    assert(
      file.type.startsWith("image/"),
      "Chỉ chấp nhận tệp hình ảnh."
    );

    assert(
      file.size <= 25 * 1024 * 1024,
      "Ảnh gốc vượt quá 25 MB."
    );

    const image = await loadImage(file);

    const scale = Math.min(
      1,
      CONFIG.PHOTO_WIDTH /
        Math.max(image.width, image.height)
    );

    const width = Math.max(
      1, Math.round(image.width * scale)
    );

    const height = Math.max(
      1, Math.round(image.height * scale)
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(640, width);
    canvas.height = height + 150;

    const ctx = canvas.getContext("2d");

    assert(ctx, "Không xử lý được ảnh.");

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
      0, 0, canvas.width, canvas.height
    );

    ctx.drawImage(
      image,
      Math.round((canvas.width - width) / 2),
      0,
      width,
      height
    );

    ctx.fillStyle = "#202020";

    ctx.fillRect(
      0, height, canvas.width, 150
    );

    ctx.fillStyle = "#f4e5a4";
    ctx.font = "bold 22px Arial";

    ctx.fillText(
      "PHỞ GÀ ĐỒI - HÀNG HỦY",
      14, height + 28,
      canvas.width - 28
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "17px Arial";

    const lines = [

      context.branch + " - " +
        BRANCH_NAMES[context.branch],

      DEPARTMENT_NAMES[context.department] +
        " | " + SHIFT_NAMES[context.shift],

      "Ngày làm việc: " + context.date +
        " | NV: " + context.employee,

      "Xử lý ảnh: " + formatTime() +
        " | " + photoId

    ];

    lines.forEach(function (line, index) {

      ctx.fillText(
        line,
        14,
        height + 54 + index * 23,
        canvas.width - 28
      );

    });

    let quality = 0.85;
    let result = canvas.toDataURL(
      "image/jpeg", quality
    );

    while (
      result.length > CONFIG.MAX_PHOTO_LENGTH &&
      quality > 0.25
    ) {

      quality -= 0.1;

      result = canvas.toDataURL(
        "image/jpeg", quality
      );

    }

    assert(
      result.length <= CONFIG.MAX_PHOTO_LENGTH,
      "Ảnh quá lớn. Vui lòng chụp lại."
    );

    return result;
  }


  /* ======================================================
     05. CSS GIAO DIỆN
  ====================================================== */

  function installStyles() {

    if (document.getElementById("pgd-inventory-css")) {
      return;
    }

    const style = document.createElement("style");

    style.id = "pgd-inventory-css";

    style.textContent = `
      .pgdi {
        font-family: Arial, sans-serif;
        color: #222;
        line-height: 1.5;
      }

      .pgdi * {
        box-sizing: border-box;
      }

      .pgdi-header {
        background: #941c1c;
        color: #f4e5a4;
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 14px;
      }

      .pgdi-header h2 {
        margin: 0 0 6px;
        font-size: 21px;
      }

      .pgdi-header p {
        margin: 0;
        font-size: 13px;
      }

      .pgdi-progress {
        background: #fff;
        border: 1px solid #e5e5e5;
        padding: 14px;
        border-radius: 10px;
        margin-bottom: 14px;
      }

      .pgdi-progress-top {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-weight: bold;
        font-size: 14px;
      }

      .pgdi-track {
        height: 9px;
        background: #e9e9e9;
        border-radius: 20px;
        overflow: hidden;
        margin-top: 10px;
      }

      .pgdi-bar {
        height: 100%;
        background: #27864b;
        width: 0;
        transition: width .2s;
      }

      .pgdi-section-title {
        margin: 22px 0 10px;
        color: #941c1c;
        font-size: 15px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .pgdi-item {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 10px;
      }

      .pgdi-item.done {
        border-color: #9ac8a8;
      }

      .pgdi-item.warning {
        border-color: #dfae52;
      }

      .pgdi-item.invalid {
        border-color: #c52222;
      }

      .pgdi-item-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 15px;
        font-weight: bold;
        margin-bottom: 12px;
      }

      .pgdi-mark {
        color: #888;
      }

      .pgdi-item.done .pgdi-mark {
        color: #27864b;
      }

      .pgdi-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .pgdi-label {
        display: block;
        font-size: 12px;
        color: #555;
        margin-bottom: 5px;
      }

      .pgdi input,
      .pgdi textarea {
        font: inherit;
        font-size: 16px;
        width: 100%;
        padding: 11px;
        border: 1px solid #ccc;
        border-radius: 7px;
        background: #fff;
        color: #222;
      }

      .pgdi input:focus,
      .pgdi textarea:focus {
        outline: 2px solid #d7a33c;
        outline-offset: 1px;
      }

      .pgdi input:disabled,
      .pgdi textarea:disabled {
        background: #f0f0f0;
      }

      .pgdi input.pgdi-invalid {
        border-color: #c52222;
        background: #fff4f4;
      }

      .pgdi-statuses {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 7px;
      }

      .pgdi button {
        font: inherit;
        cursor: pointer;
        touch-action: manipulation;
      }

      .pgdi-choice {
        border: 1px solid #ddd;
        border-radius: 7px;
        background: #fff;
        padding: 12px 4px;
        color: #333;
        font-size: 14px !important;
      }

      .pgdi-choice.selected.good {
        background: #27864b;
        color: #fff;
        border-color: #27864b;
      }

      .pgdi-choice.selected.low {
        background: #f2bd55;
        color: #3d2900;
        border-color: #f2bd55;
      }

      .pgdi-choice.selected.out {
        background: #b92525;
        color: #fff;
        border-color: #b92525;
      }

      .pgdi-warning-box {
        border: 1px solid #e7c77e;
        background: #fff8e8;
        border-radius: 9px;
        padding: 12px;
        margin: 15px 0;
      }

      .pgdi-warning-box ul {
        margin: 8px 0 0;
        padding-left: 22px;
      }

      .pgdi-waste {
        border: 1px solid #dfb0b0;
        background: #fff7f7;
        border-radius: 10px;
        padding: 14px;
        margin: 15px 0;
      }

      .pgdi-waste h3 {
        margin: 0 0 8px;
        color: #941c1c;
        font-size: 17px;
      }

      .pgdi-waste textarea {
        min-height: 95px;
        resize: vertical;
      }

      .pgdi-photo-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin: 12px 0;
      }

      .pgdi-photo {
        border: 1px solid #ddd;
        border-radius: 8px;
        overflow: hidden;
        background: #fff;
      }

      .pgdi-photo img {
        display: block;
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: contain;
        background: #eee;
      }

      .pgdi-photo button {
        width: 100%;
        padding: 8px;
        border: 0;
        background: #f8e7e7;
        color: #941c1c;
      }

      .pgdi-primary {
        width: 100%;
        border: 0;
        border-radius: 9px;
        background: #941c1c;
        color: #fff;
        padding: 14px;
        font-weight: bold !important;
      }

      .pgdi-secondary {
        width: 100%;
        border: 1px solid #941c1c;
        border-radius: 8px;
        background: #fff;
        color: #941c1c;
        padding: 12px;
        font-weight: bold !important;
      }

      .pgdi button:disabled {
        opacity: .5;
        cursor: not-allowed;
      }

      .pgdi-message {
        font-size: 13px;
        margin: 12px 0;
        color: #555;
        overflow-wrap: anywhere;
      }

      .pgdi-message.error {
        color: #b92525;
        font-weight: bold;
      }

      .pgdi-message.success {
        color: #27864b;
      }

      .pgdi-help {
        color: #666;
        font-size: 12px;
        margin: 8px 0;
      }

      .pgdi-empty {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 10px;
        padding: 20px;
        text-align: center;
      }

      .pgdi [hidden] {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }


  /* ======================================================
     06. KHỞI TẠO MODULE
  ====================================================== */

  async function mount(options) {

    assert(options, "Thiếu cấu hình kiểm kê.");

    assert(
      global.PGDDraft &&
      global.PGDDraft.config.VERSION === "7.5.2",
      "Yêu cầu draft.js phiên bản 7.5.2."
    );

    const container =
      typeof options.container === "string"
        ? document.querySelector(options.container)
        : options.container;

    assert(container, "Không tìm thấy vùng kiểm kê.");

    const context = clone(options.context);

    PGDDraft.makeKey(context);

    const catalog = validateCatalog(
      context.department,
      options.catalog ||
        getCatalog(context.department)
    );

    const restored = await PGDDraft.restoreLocal(
      context
    );

    let locked = Boolean(
      restored &&
      !["DRAFT", "REJECTED"].includes(
        restored.status
      )
    );

    assert(
      !restored ||
      restored.catalogRevision ===
        CONFIG.CATALOG_REVISION,
      "Bản nháp chưa được chuyển đổi danh mục."
    );

    const oldData = restored
      ? restored.data || {}
      : {};

    let inventory = {};
    let supplies = {};
    let photos = {};
    let wasteNote = oldData.wasteNote || "";

    catalog.forEach(function (item) {

      if (item.type === "NUMBER") {

        const previous =
          (oldData.inventory || {})[item.id];

        inventory[item.id] = previous
          ? clone(previous)
          : {
              remaining: null,
              waste: 0
            };

      } else {

        supplies[item.id] =
          (oldData.supplies || {})[item.id] || "";

      }

    });

    Object.entries(
      restored ? restored.photos || {} : {}
    ).forEach(function (entry) {

      if (/^WASTE_0[1-5]$/.test(entry[0])) {
        photos[entry[0]] = clone(entry[1]);
      }

    });

    let pending = 0;
    let processing = false;
    let destroyed = false;
    let error = "";
    let lastSaved = Boolean(restored);
    let queue = Promise.resolve();
    let wasteRevision = 0;

    const invalidInputs = new Set();
    const controls = new Map();

    installStyles();

    container.replaceChildren();

    const root = element("div", "pgdi");

    container.appendChild(root);


    /* ====================================================
       07. TÍNH TRẠNG THÁI
    ==================================================== */

    function getWasteItems() {

      return catalog
        .filter(function (item) {

          return (
            item.type === "NUMBER" &&
            Number(inventory[item.id].waste) > 0
          );

        })
        .map(function (item) {

          return {
            id: item.id,
            name: item.name,
            unit: item.unit,
            quantity: inventory[item.id].waste
          };

        });
    }

    function getWarnings() {

      const warnings = [];

      catalog.forEach(function (item) {

        if (item.type === "NUMBER") {

          if (inventory[item.id].remaining === 0) {

            warnings.push({
              id: item.id,
              name: item.name,
              status: "Hết"
            });

          }

        } else {

          const status = supplies[item.id];

          if (
            status === "Gần hết" ||
            status === "Hết"
          ) {

            warnings.push({
              id: item.id,
              name: item.name,
              status: status
            });

          }

        }

      });

      return warnings;
    }

    function itemComplete(item) {

      if (item.type === "NUMBER") {

        const value = inventory[item.id];

        return (
          !invalidInputs.has(
            item.id + ":remaining"
          ) &&
          !invalidInputs.has(
            item.id + ":waste"
          ) &&
          validQuantity(value.remaining, item) &&
          validQuantity(value.waste, item)
        );

      }

      return CONFIG.STATUSES.includes(
        supplies[item.id]
      );
    }

    function getState() {

      const completed =
        catalog.filter(itemComplete).length;

      const wasteItems = getWasteItems();

      const hasWaste = wasteItems.length > 0;

      const photoCount = Object.values(photos)
        .filter(function (photo) {

          return (
            photo &&
            typeof photo.data === "string" &&
            photo.data.startsWith(
              "data:image/jpeg;base64,"
            )
          );

        }).length;

      const wasteComplete = hasWaste

        ? (
            wasteNote.trim().length > 0 &&
            wasteNote.length <=
              CONFIG.MAX_NOTE_LENGTH &&
            photoCount >=
              CONFIG.MIN_WASTE_PHOTOS &&
            photoCount <=
              CONFIG.MAX_WASTE_PHOTOS
          )

        : (
            wasteNote.trim() === "" &&
            Object.keys(photos).length === 0
          );

      return {

        completed: completed,
        total: catalog.length,

        hasWaste: hasWaste,
        wasteItems: wasteItems,
        wastePhotoCount: photoCount,
        wasteComplete: wasteComplete,

        warnings: getWarnings(),

        pending: pending,
        processing: processing,
        locked: locked,
        error: error,

        complete:
          completed === catalog.length &&
          wasteComplete &&
          invalidInputs.size === 0 &&
          pending === 0 &&
          !processing &&
          !error

      };
    }


    /* ====================================================
       08. LƯU BẢN NHÁP
    ==================================================== */

    function enqueue(task) {

      if (destroyed) {
        return Promise.reject(
          new Error("Module đã đóng.")
        );
      }

      pending++;

      refresh();

      const next = queue.then(async function () {

        if (error) {
          throw new Error(error);
        }

        const result = await task();

        lastSaved = true;

        return result;

      });

      queue = next.then(

        function () {
          pending--;
          refresh();
        },

        function (failure) {
          pending--;
          error = failure.message ||
            "Không lưu được dữ liệu.";
          refresh();
        }

      );

      return next;
    }

    function saveFields() {

      const snapshot = {

        inventory: clone(inventory),
        supplies: clone(supplies),
        wasteNote: wasteNote

      };

      return enqueue(function () {

        return PGDDraft.saveFieldsLocal(
          context,
          snapshot
        );

      });
    }

    function handleSave() {

      saveFields().catch(function () {
        // Lỗi được hiển thị tại refresh().
      });

    }

    function resetWasteEvidence() {

      wasteRevision++;

      wasteNote = "";
      photos = {};

      noteInput.value = "";

      renderPhotos();
    }


    /* ====================================================
       09. TIÊU ĐỀ VÀ TIẾN ĐỘ
    ==================================================== */

    const header = element("div", "pgdi-header");

    header.appendChild(
      element(
        "h2",
        "",
        DEPARTMENT_NAMES[context.department]
      )
    );

    header.appendChild(
      element(
        "p",
        "",
        context.branch + " - " +
          BRANCH_NAMES[context.branch] +
          " | " + SHIFT_NAMES[context.shift]
      )
    );

    header.appendChild(
      element(
        "p",
        "",
        "Ngày: " + context.date +
          " | NV: " + context.employee
      )
    );

    root.appendChild(header);

    const progress = element(
      "div", "pgdi-progress"
    );

    const progressTop = element(
      "div", "pgdi-progress-top"
    );

    progressTop.appendChild(
      element("span", "", "Tiến độ kiểm kê")
    );

    const progressText = element("span");

    progressTop.appendChild(progressText);

    const track = element("div", "pgdi-track");
    const bar = element("div", "pgdi-bar");

    track.appendChild(bar);
    progress.append(progressTop, track);
    root.appendChild(progress);


    /* ====================================================
       10. GIAO DIỆN KIỂM KÊ SỐ LƯỢNG
    ==================================================== */

    function renderNumeric(item, index) {

      const card = element("div", "pgdi-item");

      const title = element(
        "div", "pgdi-item-title"
      );

      const mark = element(
        "span", "pgdi-mark", "○"
      );

      title.append(
        element(
          "span",
          "",
          (index + 1) + ". " + item.name
        ),
        mark
      );

      card.appendChild(title);

      const fields = element(
        "div", "pgdi-fields"
      );

      const inputMap = {};

      ["remaining", "waste"].forEach(
        function (field) {

          const wrapper = element("label");

          const label = element(
            "span",
            "pgdi-label",
            (
              field === "remaining"
                ? "Tồn cuối"
                : "Hàng hủy"
            ) + " (" + item.unit + ")"
          );

          const input = element("input");

          input.type = "number";
          input.min = "0";
          input.max = String(
            CONFIG.MAX_QUANTITY
          );

          input.step = allowsDecimal(item)
            ? "any" : "1";

          input.inputMode = allowsDecimal(item)
            ? "decimal" : "numeric";

          input.placeholder = "Nhập số lượng";

          const value = inventory[item.id][field];

          input.value =
            value === null ||
            value === undefined
              ? ""
              : String(value);

          input.disabled = locked;

          input.addEventListener(
            "input",
            function () {

              if (locked || destroyed || error) {
                return;
              }

              const key =
                item.id + ":" + field;

              const before =
                wasteSignature(inventory);

              try {

                const parsed = parseQuantity(
                  input.value, item
                );

                if (input.validity.badInput) {

                  throw new Error(
                    "Số lượng không hợp lệ."
                  );

                }

                inventory[item.id][field] =
                  parsed;

                invalidInputs.delete(key);

                input.classList.remove(
                  "pgdi-invalid"
                );

                input.setCustomValidity("");

              } catch (failure) {

                invalidInputs.add(key);

                input.classList.add(
                  "pgdi-invalid"
                );

                input.setCustomValidity(
                  failure.message
                );

                refresh();
                return;
              }

              if (
                before !==
                wasteSignature(inventory)
              ) {

                resetWasteEvidence();

              }

              handleSave();
              refresh();

            }
          );

          input.addEventListener(
            "blur",
            function () {

              if (
                field === "waste" &&
                input.value === "" &&
                !locked &&
                !error
              ) {

                input.value = "0";

                input.dispatchEvent(
                  new Event("input")
                );

              }

            }
          );

          inputMap[field] = input;

          wrapper.append(label, input);
          fields.appendChild(wrapper);

        }
      );

      card.appendChild(fields);

      controls.set(item.id, {
        card: card,
        mark: mark,
        inputs: inputMap
      });

      root.appendChild(card);
    }


    /* ====================================================
       11. GIAO DIỆN KIỂM KÊ TRẠNG THÁI
    ==================================================== */

    function renderStatus(item, index) {

      const card = element("div", "pgdi-item");

      const title = element(
        "div", "pgdi-item-title"
      );

      const mark = element(
        "span", "pgdi-mark", "○"
      );

      title.append(
        element(
          "span",
          "",
          (index + 1) + ". " + item.name
        ),
        mark
      );

      card.appendChild(title);

      const buttons = element(
        "div", "pgdi-statuses"
      );

      const buttonMap = {};

      CONFIG.STATUSES.forEach(function (status, i) {

        const button = element(
          "button",
          "pgdi-choice " +
            ["good", "low", "out"][i],
          status
        );

        button.type = "button";

        button.disabled = locked;

        button.addEventListener(
          "click",
          function () {

            if (locked || destroyed || error) {
              return;
            }

            supplies[item.id] = status;

            handleSave();
            refresh();

          }
        );

        buttonMap[status] = button;

        buttons.appendChild(button);

      });

      card.appendChild(buttons);

      controls.set(item.id, {
        card: card,
        mark: mark,
        buttons: buttonMap
      });

      root.appendChild(card);
    }


    /* ====================================================
       12. HIỂN THỊ DANH MỤC
    ==================================================== */

    const numericItems = catalog.filter(
      item => item.type === "NUMBER"
    );

    const statusItems = catalog.filter(
      item => item.type === "STATUS"
    );

    if (numericItems.length) {

      root.appendChild(
        element(
          "div",
          "pgdi-section-title",
          "Kiểm kê số lượng"
        )
      );

      numericItems.forEach(renderNumeric);

    }

    if (statusItems.length) {

      root.appendChild(
        element(
          "div",
          "pgdi-section-title",
          "Kiểm kê tình trạng vật tư"
        )
      );

      statusItems.forEach(function (item, i) {

        renderStatus(
          item,
          numericItems.length + i
        );

      });

    }

    if (catalog.length === 0) {

      root.appendChild(
        element(
          "div",
          "pgdi-empty",
          "Trưởng ca không phải nhập lại kiểm kê. " +
          "Số liệu sẽ được tổng hợp từ 4 bộ phận."
        )
      );

    }


    /* ====================================================
       13. CẢNH BÁO VẬT TƯ
    ==================================================== */

    const warningBox = element(
      "div", "pgdi-warning-box"
    );

    const warningTitle = element(
      "strong", "", "Vật tư cần chú ý"
    );

    const warningList = element("ul");

    warningBox.append(
      warningTitle,
      warningList
    );

    root.appendChild(warningBox);


    /* ====================================================
       14. KHU VỰC HÀNG HỦY
    ==================================================== */

    const wasteBox = element(
      "section", "pgdi-waste"
    );

    wasteBox.appendChild(
      element(
        "h3", "", "GIẢI TRÌNH HÀNG HỦY"
      )
    );

    const wasteList = element("ul");

    wasteBox.appendChild(wasteList);

    wasteBox.appendChild(
      element(
        "p",
        "pgdi-help",
        "Ghi rõ lý do hủy của từng nguyên liệu. " +
        "Bắt buộc từ 1 đến 5 ảnh minh chứng."
      )
    );

    const noteInput = element("textarea");

    noteInput.maxLength =
      CONFIG.MAX_NOTE_LENGTH;

    noteInput.placeholder =
      "Ví dụ: Gà luộc 1 con bị hỏng, " +
      "không đảm bảo chất lượng...";

    noteInput.value = wasteNote;

    noteInput.addEventListener(
      "input",
      function () {

        if (locked || destroyed || error) {
          return;
        }

        wasteNote = noteInput.value;

        handleSave();
        refresh();

      }
    );

    wasteBox.appendChild(noteInput);

    const photoCounter = element(
      "div", "pgdi-help"
    );

    wasteBox.appendChild(photoCounter);

    const photoGrid = element(
      "div", "pgdi-photo-grid"
    );

    wasteBox.appendChild(photoGrid);

    const photoInput = element("input");

    photoInput.type = "file";
    photoInput.accept = "image/*";

    photoInput.setAttribute(
      "capture", "environment"
    );

    photoInput.hidden = true;

    const addPhotoButton = element(
      "button",
      "pgdi-secondary",
      "Chụp / thêm ảnh minh chứng"
    );

    addPhotoButton.type = "button";

    addPhotoButton.addEventListener(
      "click",
      function () {

        if (
          locked ||
          processing ||
          error ||
          !getWasteItems().length
        ) return;

        photoInput.click();

      }
    );

    wasteBox.append(
      photoInput,
      addPhotoButton,
      element(
        "p",
        "pgdi-help",
        "Thay đổi số lượng hàng hủy sẽ yêu cầu " +
        "nhập lại giải trình và ảnh minh chứng."
      )
    );

    root.appendChild(wasteBox);


    /* ====================================================
       15. THÊM ẢNH HÀNG HỦY
    ==================================================== */

    function nextPhotoId() {

      for (
        let i = 1;
        i <= CONFIG.MAX_WASTE_PHOTOS;
        i++
      ) {

        const id = "WASTE_0" + i;

        if (!photos[id]) return id;

      }

      return null;
    }

    photoInput.addEventListener(
      "change",
      async function () {

        const file = photoInput.files[0];

        photoInput.value = "";

        if (
          !file ||
          locked ||
          processing ||
          error ||
          destroyed
        ) return;

        if (!getWasteItems().length) return;

        const id = nextPhotoId();

        if (!id) return;

        const revision = wasteRevision;

        processing = true;
        refresh();

        try {

          const data = await processPhoto(
            file, context, id
          );

          if (
            revision !== wasteRevision ||
            !getWasteItems().length ||
            locked ||
            destroyed
          ) {

            throw new Error(
              "Hàng hủy đã thay đổi. " +
              "Vui lòng chụp lại ảnh."
            );

          }

          await enqueue(function () {

            assert(
              revision === wasteRevision &&
              !locked &&
              !destroyed,
              "Dữ liệu hàng hủy đã thay đổi."
            );

            return PGDDraft.savePhotoLocal(
              context,
              id,
              data
            );

          });

          if (revision === wasteRevision) {

            photos[id] = {
              data: data
            };

          }

        } catch (failure) {

          alert(failure.message);

        } finally {

          processing = false;

          renderPhotos();
          refresh();

        }

      }
    );


    /* ====================================================
       16. HIỂN THỊ VÀ XÓA ẢNH
    ==================================================== */

    function renderPhotos() {

      photoGrid.replaceChildren();

      Object.keys(photos)
        .sort()
        .forEach(function (id) {

          const photo = photos[id];

          if (
            !photo ||
            typeof photo.data !== "string" ||
            !photo.data.startsWith(
              "data:image/jpeg;base64,"
            )
          ) return;

          const wrapper = element(
            "div", "pgdi-photo"
          );

          const image = element("img");

          image.src = photo.data;
          image.alt = "Ảnh minh chứng " + id;

          const remove = element(
            "button", "", "Xóa ảnh"
          );

          remove.type = "button";

          remove.disabled =
            locked || processing || Boolean(error);

          remove.addEventListener(
            "click",
            async function () {

              if (
                locked ||
                processing ||
                error ||
                destroyed
              ) return;

              if (!confirm("Xóa ảnh minh chứng này?")) {
                return;
              }

              processing = true;
              refresh();

              try {

                await enqueue(function () {

                  return PGDDraft.removePhotoLocal(
                    context, id
                  );

                });

                delete photos[id];

              } catch (failure) {

                alert(failure.message);

              } finally {

                processing = false;

                renderPhotos();
                refresh();

              }

            }
          );

          wrapper.append(image, remove);

          photoGrid.appendChild(wrapper);

        });
    }


    /* ====================================================
       17. TRẠNG THÁI LƯU VÀ NÚT HOÀN THÀNH
    ==================================================== */

    const saveMessage = element(
      "div", "pgdi-message"
    );

    saveMessage.setAttribute(
      "aria-live", "polite"
    );

    const completeButton = element(
      "button",
      "pgdi-primary",
      "Hoàn thành kiểm kê"
    );

    completeButton.type = "button";

    root.append(
      saveMessage,
      completeButton
    );

    completeButton.addEventListener(
      "click",
      async function () {

        try {

          await flush();

          const result = getData();

          if (
            typeof options.onComplete === "function"
          ) {

            await options.onComplete(result);

          } else {

            alert(
              "Kiểm kê hợp lệ. " +
              "Dữ liệu đã được lưu trên thiết bị. " +
              "Chưa gửi báo cáo chính thức."
            );

          }

        } catch (failure) {

          alert(failure.message);

        }

      }
    );


    /* ====================================================
       18. CẬP NHẬT GIAO DIỆN
    ==================================================== */

    function refresh() {

      if (destroyed) return;

      const state = getState();

      const disabled =
        locked || Boolean(error) || processing;

      progressText.textContent =
        state.completed + "/" + state.total;

      bar.style.width =
        (
          state.total === 0
            ? 100
            : Math.round(
                state.completed /
                state.total * 100
              )
        ) + "%";

      catalog.forEach(function (item) {

        const control = controls.get(item.id);

        if (!control) return;

        const done = itemComplete(item);

        const warning = state.warnings.some(
          row => row.id === item.id
        );

        const invalid =
          invalidInputs.has(
            item.id + ":remaining"
          ) ||
          invalidInputs.has(
            item.id + ":waste"
          );

        control.card.classList.toggle(
          "done", done
        );

        control.card.classList.toggle(
          "warning", warning
        );

        control.card.classList.toggle(
          "invalid", invalid
        );

        control.mark.textContent =
          done ? "✓" : "○";

        if (control.inputs) {

          Object.values(control.inputs)
            .forEach(function (input) {
              input.disabled = disabled;
            });

        }

        if (control.buttons) {

          Object.entries(control.buttons)
            .forEach(function (entry) {

              const status = entry[0];
              const button = entry[1];

              const selected =
                supplies[item.id] === status;

              button.classList.toggle(
                "selected", selected
              );

              button.setAttribute(
                "aria-pressed",
                String(selected)
              );

              button.disabled = disabled;

            });

        }

      });

      warningBox.hidden =
        state.warnings.length === 0;

      warningList.replaceChildren();

      state.warnings.forEach(function (item) {

        warningList.appendChild(
          element(
            "li",
            "",
            item.name + ": " + item.status
          )
        );

      });

      wasteBox.hidden = !state.hasWaste;

      wasteList.replaceChildren();

      state.wasteItems.forEach(function (item) {

        wasteList.appendChild(
          element(
            "li",
            "",
            item.name + ": " +
              item.quantity + " " + item.unit
          )
        );

      });

      photoCounter.textContent =
        "Ảnh minh chứng: " +
        state.wastePhotoCount +
        "/5 (tối thiểu 1 ảnh)";

      noteInput.disabled = disabled;

      addPhotoButton.disabled =
        disabled ||
        state.wastePhotoCount >=
          CONFIG.MAX_WASTE_PHOTOS;

      photoGrid.querySelectorAll("button")
        .forEach(function (button) {
          button.disabled = disabled;
        });

      saveMessage.className =
        "pgdi-message";

      if (error) {

        saveMessage.textContent =
          "Lỗi lưu dữ liệu: " + error +
          " Không chuyển bộ phận. " +
          "Hãy báo quản lý.";

        saveMessage.classList.add("error");

      } else if (invalidInputs.size) {

        saveMessage.textContent =
          "Có số lượng không hợp lệ. " +
          "Vui lòng kiểm tra lại.";

        saveMessage.classList.add("error");

      } else if (processing) {

        saveMessage.textContent =
          "Đang xử lý hình ảnh...";

      } else if (pending > 0) {

        saveMessage.textContent =
          "Đang lưu bản nháp...";

      } else if (locked) {

        saveMessage.textContent =
          "Bản nháp đã khóa, chỉ được xem.";

      } else if (lastSaved) {

        saveMessage.textContent =
          "✓ Đã lưu bản nháp trên thiết bị";

        saveMessage.classList.add("success");

      } else {

        saveMessage.textContent =
          "Chưa phát sinh dữ liệu cần lưu.";

      }

      completeButton.disabled =
        !state.complete || locked;

      if (locked) {

        completeButton.textContent =
          "Bản nháp đã khóa";

      } else if (
        state.completed !== state.total
      ) {

        completeButton.textContent =
          "Hoàn thành kiểm kê (" +
          state.completed + "/" +
          state.total + ")";

      } else if (!state.wasteComplete) {

        completeButton.textContent =
          "Chưa đủ giải trình / ảnh hàng hủy";

      } else if (state.complete) {

        completeButton.textContent =
          "✓ Hoàn thành kiểm kê";

      } else {

        completeButton.textContent =
          "Đang kiểm tra dữ liệu...";

      }

      if (
        typeof options.onChange === "function"
      ) {

        try {

          options.onChange(clone(state));

        } catch (failure) {

          console.error(
            "Lỗi onChange:", failure
          );

        }

      }

    }


    /* ====================================================
       19. HÀM GIAO TIẾP VỚI MODULE KHÁC
    ==================================================== */

    async function flush() {

      assert(
        !processing,
        "Đang xử lý ảnh. Vui lòng chờ."
      );

      await queue;

      assert(!error, error);

      assert(
        invalidInputs.size === 0,
        "Còn số lượng không hợp lệ."
      );

      return getState();
    }

    function getData() {

      const state = getState();

      assert(
        state.complete,
        "Chưa hoàn thành kiểm kê."
      );

      return {
        inventory: clone(inventory),
        supplies: clone(supplies),
        wasteNote: wasteNote.trim(),
        wastePhotos: clone(photos)
      };
    }

    async function lock() {

      await flush();

      locked = true;

      refresh();
    }

    async function destroy() {

      await flush();

      destroyed = true;

      container.replaceChildren();
    }

    renderPhotos();
    refresh();

    return Object.freeze({
      getState: getState,
      getData: getData,
      flush: flush,
      lock: lock,
      destroy: destroy
    });

  }


  /* ======================================================
     20. KIỂM THỬ LOGIC - 16 BÀI
  ====================================================== */

  function selfTest() {

    let passed = 0;

    const results = [];

    function check(name, condition) {

      assert(condition, name);

      passed++;

      results.push(
        "ĐẠT " + passed + " - " + name
      );
    }

    try {

      check(
        "Tổng danh mục 41",
        CATALOG.length === 41
      );

      check(
        "13 hạng mục số lượng",
        CATALOG.filter(
          r => r.type === "NUMBER"
        ).length === 13
      );

      check(
        "28 hạng mục trạng thái",
        CATALOG.filter(
          r => r.type === "STATUS"
        ).length === 28
      );

      check(
        "Không trùng mã kiểm kê",
        new Set(
          CATALOG.map(r => r.id)
        ).size === 41
      );

      check(
        "Bếp phở có 5 hạng mục",
        getCatalog("BEP_PHO").length === 5
      );

      check(
        "Bếp vật tư có 14 hạng mục",
        getCatalog("BEP_VAT_TU").length === 14
      );

      check(
        "Chạy bàn có 17 hạng mục",
        getCatalog("CHAY_BAN").length === 17
      );

      check(
        "Vệ sinh có 5 hạng mục",
        getCatalog("VE_SINH").length === 5
      );

      check(
        "Trưởng ca không kiểm kê lại",
        getCatalog("TRUONG_CA").length === 0
      );

      check(
        "Quẩy chuyển đúng bộ phận",
        getCatalog("CHAY_BAN").some(
          r => r.id === "KK004"
        )
      );

      check(
        "Hành rau thơm chuyển đúng bộ phận",
        getCatalog("BEP_VAT_TU").some(
          r => r.id === "KK005"
        )
      );

      check(
        "Loại gas và hai mã trà cũ",
        !CATALOG.some(
          r => [
            "KK019", "KK026", "KK027"
          ].includes(r.id)
        )
      );

      const chicken = CATALOG.find(
        r => r.id === "KK042"
      );

      const noodles = CATALOG.find(
        r => r.id === "KK002"
      );

      check(
        "Chấp nhận số 0",
        validQuantity(0, chicken)
      );

      check(
        "Chặn số âm và ô trống",
        !validQuantity(-1, chicken) &&
        !validQuantity(null, chicken)
      );

      check(
        "Chặn gà thập phân, cho phép Kg thập phân",
        !validQuantity(1.5, chicken) &&
        validQuantity(1.5, noodles)
      );

      let rejected = false;

      try {

        const wrong = getCatalog("BEP_PHO");

        wrong[0].id = "KK004";

        validateCatalog("BEP_PHO", wrong);

      } catch (failure) {

        rejected = true;

      }

      check(
        "Chặn danh mục sai phiên bản",
        rejected
      );

      return {
        success: true,
        passed: passed,
        total: 16,
        results: results
      };

    } catch (failure) {

      return {
        success: false,
        passed: passed,
        total: 16,
        error: failure.message,
        results: results
      };

    }
  }


  /* ======================================================
     21. XUẤT MODULE
  ====================================================== */

  global.PGDInventory = Object.freeze({

    config: CONFIG,

    getCatalog: getCatalog,

    validateCatalog: validateCatalog,

    mount: mount,

    selfTest: selfTest

  });

})(window);

/************************************************************
 * KẾT THÚC INVENTORY.JS
 ************************************************************/
