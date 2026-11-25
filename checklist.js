
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.6
 * FILE: checklist.js
 * MODULE GIAO DIỆN CHECKLIST
 ************************************************************/

(function (global) {

  "use strict";


  /* ======================================================
     01. CẤU HÌNH
  ====================================================== */

  const CONFIG = Object.freeze({

    VERSION: "7.6",

    CATALOG_REVISION: "751",

    TOTAL_ITEMS: 47,

    STAFF_ITEMS: 32,

    LEADER_ITEMS: 15,

    DEPARTMENTS: {

      BEP_PHO: 7,

      BEP_VAT_TU: 8,

      CHAY_BAN: 8,

      VE_SINH: 9,

      TRUONG_CA: 15

    }

  });


  const DEPARTMENT_NAMES = {

    BEP_PHO: "Bếp phở",

    BEP_VAT_TU: "Bếp vật tư + dọn dẹp",

    CHAY_BAN: "Chạy bàn + vật tư nguyên liệu",

    VE_SINH: "Vệ sinh chung",

    TRUONG_CA: "Trưởng ca"

  };


  const APPROVAL_MAP = {

    CL033: "BEP_PHO",

    CL034: "BEP_VAT_TU",

    CL035: "CHAY_BAN",

    CL036: "VE_SINH"

  };


  /* ======================================================
     02. DANH MỤC CHECKLIST
  ====================================================== */

  const ROWS = [

    // BẾP PHỞ

    ["CL001", "BEP_PHO",
      "Kiểm tra chất lượng nguyên liệu còn lại"],

    ["CL002", "BEP_PHO",
      "Phân loại thực phẩm sử dụng tiếp và thực phẩm phải hủy"],

    ["CL003", "BEP_PHO",
      "Kiểm tra và xử lý hàng hủy nếu phát sinh"],

    ["CL004", "BEP_PHO",
      "Bảo quản thực phẩm đúng quy định"],

    ["CL005", "BEP_PHO",
      "Vệ sinh nồi nước dùng và dụng cụ chế biến"],

    ["CL006", "BEP_PHO",
      "Vệ sinh khu vực làm phở"],

    ["CL007", "BEP_PHO",
      "Kiểm tra và tắt thiết bị nấu không cần sử dụng"],


    // BẾP VẬT TƯ

    ["CL008", "BEP_VAT_TU",
      "Rửa sạch bát, đũa và dụng cụ bếp"],

    ["CL009", "BEP_VAT_TU",
      "Sắp xếp dụng cụ đúng vị trí"],

    ["CL010", "BEP_VAT_TU",
      "Vệ sinh khu vực sơ chế"],

    ["CL011", "BEP_VAT_TU",
      "Vệ sinh khu vực rửa bát"],

    ["CL012", "BEP_VAT_TU",
      "Vệ sinh khu vực giấm, ớt, măng"],

    ["CL013", "BEP_VAT_TU",
      "Vệ sinh sàn bếp và đường thoát nước"],

    ["CL014", "BEP_VAT_TU",
      "Kiểm tra van gas và thiết bị điện khu vực bếp"],

    ["CL015", "BEP_VAT_TU",
      "Không để thực phẩm thừa bên ngoài qua đêm"],


    // CHẠY BÀN

    ["CL016", "CHAY_BAN",
      "Lau sạch toàn bộ bàn ghế"],

    ["CL017", "CHAY_BAN",
      "Vệ sinh lọ gia vị trên bàn"],

    ["CL018", "CHAY_BAN",
      "Bổ sung giấy ăn, tăm và gia vị phục vụ"],

    ["CL019", "CHAY_BAN",
      "Sắp xếp bàn ghế đúng vị trí"],

    ["CL020", "CHAY_BAN",
      "Sắp xếp đồ uống trong tủ"],

    ["CL021", "CHAY_BAN",
      "Chuẩn bị vật tư bán hàng cho ngày hôm sau"],

    ["CL022", "CHAY_BAN",
      "Kiểm tra đồ khách bỏ quên"],

    ["CL023", "CHAY_BAN",
      "Thu dọn khu vực đóng gói mang về"],


    // VỆ SINH CHUNG

    ["CL024", "VE_SINH",
      "Quét và lau sàn khu vực khách hàng"],

    ["CL025", "VE_SINH",
      "Vệ sinh khu vực ngoài sân"],

    ["CL026", "VE_SINH",
      "Vệ sinh nhà vệ sinh"],

    ["CL027", "VE_SINH",
      "Vệ sinh bồn rửa tay"],

    ["CL028", "VE_SINH",
      "Bổ sung giấy vệ sinh và nước rửa tay"],

    ["CL029", "VE_SINH",
      "Thu gom toàn bộ rác thải"],

    ["CL030", "VE_SINH",
      "Vệ sinh thùng rác và thay túi rác"],

    ["CL031", "VE_SINH",
      "Kiểm tra không còn nước đọng trên sàn"],

    ["CL032", "VE_SINH",
      "Sắp xếp dụng cụ vệ sinh đúng vị trí"],


    // TRƯỞNG CA

    ["CL033", "TRUONG_CA",
      "Nghiệm thu bộ phận Bếp phở"],

    ["CL034", "TRUONG_CA",
      "Nghiệm thu bộ phận Bếp vật tư + dọn dẹp"],

    ["CL035", "TRUONG_CA",
      "Nghiệm thu bộ phận Chạy bàn + Vật tư nguyên liệu"],

    ["CL036", "TRUONG_CA",
      "Nghiệm thu bộ phận Vệ sinh chung"],

    ["CL037", "TRUONG_CA",
      "Kiểm tra số liệu kiểm kê bất thường"],

    ["CL038", "TRUONG_CA",
      "Kiểm tra hàng hủy và hình ảnh minh chứng"],

    ["CL039", "TRUONG_CA",
      "Kiểm tra vật tư cần nhập bổ sung"],

    ["CL040", "TRUONG_CA",
      "Kiểm tra hệ thống gas và van khóa"],

    ["CL041", "TRUONG_CA",
      "Kiểm tra thiết bị điện không cần sử dụng đã tắt"],

    ["CL042", "TRUONG_CA",
      "Kiểm tra tủ lạnh và thiết bị bảo quản vẫn hoạt động"],

    ["CL043", "TRUONG_CA",
      "Kiểm tra nguồn nước và vòi nước"],

    ["CL044", "TRUONG_CA",
      "Kiểm tra không còn nguy cơ cháy nổ"],

    ["CL045", "TRUONG_CA",
      "Kiểm tra cửa sổ, cửa phụ và cửa chính"],

    ["CL046", "TRUONG_CA",
      "Kiểm tra không còn người bên trong trước khi khóa cửa"],

    ["CL047", "TRUONG_CA",
      "Xác nhận cửa hàng đã được khóa an toàn"]

  ];


  const CATALOG = ROWS.map(function (row) {

    let type = "MANUAL";

    if (

      Object.prototype.hasOwnProperty.call(

        APPROVAL_MAP,

        row[0]

      )

    ) {

      type = "APPROVAL";

    }

    if (row[0] === "CL047") {

      type = "FINAL_LOCK";

    }

    return Object.freeze({

      id: row[0],

      department: row[1],

      name: row[2],

      required: true,

      type: type

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

      CATALOG.filter(

        item => item.department === department

      )

    );

  }


  function validateCatalog(department, catalog) {

    const expected = getCatalog(department);

    assert(

      Array.isArray(catalog),

      "Danh mục checklist không hợp lệ."

    );

    assert(

      catalog.length === expected.length,

      "Sai số lượng checklist."

    );

    const ids = new Set();

    catalog.forEach(function (item) {

      assert(

        item && typeof item.id === "string",

        "Thiếu mã checklist."

      );

      assert(

        !ids.has(item.id),

        "Trùng mã checklist."

      );

      ids.add(item.id);

      const original = expected.find(

        row => row.id === item.id

      );

      assert(

        original &&

        item.name === original.name &&

        item.department === department &&

        item.type === original.type &&

        item.required === true,

        "Danh mục không khớp: " + item.id

      );

    });

    return expected;

  }


  /* ======================================================
     04. CHUẨN HÓA CHECKLIST
  ====================================================== */

  function normalize(department, values) {

    const catalog = getCatalog(department);

    const source =

      values === undefined ? {} : values;

    assert(

      source &&

      typeof source === "object" &&

      !Array.isArray(source),

      "Dữ liệu checklist không hợp lệ."

    );

    const allowed = new Set(

      catalog.map(item => item.id)

    );

    Object.keys(source).forEach(function (id) {

      assert(

        allowed.has(id),

        "Checklist sai bộ phận: " + id

      );

      assert(

        typeof source[id] === "boolean",

        "Checklist phải là boolean: " + id

      );

    });

    const result = {};

    catalog.forEach(function (item) {

      result[item.id] = source[item.id] === true;

    });

    return result;

  }


  /* ======================================================
     05. TÍNH TIẾN ĐỘ
  ====================================================== */

  function evaluate(

    department,

    values,

    testEvidence

  ) {

    const catalog = getCatalog(department);

    const checklist = normalize(

      department,

      values

    );

    const evidence = testEvidence || {};

    const approvals = evidence.approvals || {};

    const photos = evidence.photos || {};

    let readyForLock = false;

    if (department === "TRUONG_CA") {

      Object.keys(APPROVAL_MAP).forEach(

        function (id) {

          checklist[id] =

            approvals[APPROVAL_MAP[id]] === true;

        }

      );

      const approved = Object.keys(

        APPROVAL_MAP

      ).every(function (id) {

        return checklist[id] === true;

      });

      const manualComplete = catalog.filter(

        item => item.type === "MANUAL"

      ).every(function (item) {

        return checklist[item.id] === true;

      });

      const prePhotos = [

        "HA010",

        "HA011",

        "HA012",

        "HA013"

      ].every(function (id) {

        return photos[id] === true;

      });

      readyForLock =

        approved &&

        manualComplete &&

        prePhotos;

      checklist.CL047 =

        checklist.CL047 === true &&

        readyForLock &&

        photos.HA014 === true;

    }

    const completed = catalog.filter(

      item => checklist[item.id] === true

    ).length;

    return {

      completed: completed,

      total: catalog.length,

      complete: completed === catalog.length,

      checklist: checklist,

      readyForLock: readyForLock,

      missing: catalog.filter(

        item => !checklist[item.id]

      )

    };

  }


  /* ======================================================
     06. CSS GIAO DIỆN
  ====================================================== */

  function installStyles() {

    if (

      document.getElementById("pgd-checklist-css")

    ) return;

    const style = document.createElement("style");

    style.id = "pgd-checklist-css";

    style.textContent = `

      .pgdc {
        font-family: Arial, sans-serif;
        color: #222;
        line-height: 1.5;
      }

      .pgdc * {
        box-sizing: border-box;
      }

      .pgdc-header {
        background: #941c1c;
        color: #f4e5a4;
        padding: 18px;
        border-radius: 12px;
        margin-bottom: 14px;
      }

      .pgdc-header h2 {
        font-size: 21px;
        margin: 0 0 6px;
      }

      .pgdc-header p {
        font-size: 13px;
        margin: 0;
      }

      .pgdc-progress {
        background: #fff;
        border: 1px solid #ddd;
        padding: 14px;
        border-radius: 10px;
        margin-bottom: 15px;
      }

      .pgdc-progress-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-weight: bold;
      }

      .pgdc-track {
        height: 9px;
        background: #e9e9e9;
        border-radius: 20px;
        overflow: hidden;
        margin-top: 10px;
      }

      .pgdc-bar {
        height: 100%;
        background: #27864b;
        width: 0;
        transition: width .2s;
      }

      .pgdc-section {
        color: #941c1c;
        font-size: 14px;
        font-weight: bold;
        margin: 20px 0 10px;
      }

      .pgdc-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 10px;
        padding: 15px;
        margin-bottom: 10px;
        min-height: 72px;
        cursor: pointer;
      }

      .pgdc-item.done {
        border-color: #8fbe9d;
        background: #f4faf5;
      }

      .pgdc-item.blocked {
        background: #f1f1f1;
        cursor: default;
      }

      .pgdc-item input {
        flex: 0 0 25px;
        width: 25px;
        height: 25px;
        margin: 0;
        accent-color: #27864b;
      }

      .pgdc-item-text {
        flex: 1;
        font-size: 15px;
        font-weight: 600;
      }

      .pgdc-detail {
        display: block;
        color: #777;
        font-size: 12px;
        font-weight: normal;
        margin-top: 4px;
      }

      .pgdc-item.done .pgdc-detail {
        color: #27864b;
      }

      .pgdc-notice {
        background: #fff8e8;
        border: 1px solid #e3c580;
        padding: 12px;
        border-radius: 8px;
        margin: 12px 0;
        font-size: 13px;
      }

      .pgdc-message {
        color: #666;
        font-size: 13px;
        margin: 13px 0;
      }

      .pgdc-message.success {
        color: #27864b;
      }

      .pgdc-message.error {
        color: #b92525;
        font-weight: bold;
      }

      .pgdc-primary {
        width: 100%;
        border: 0;
        border-radius: 9px;
        background: #941c1c;
        color: #fff;
        font-size: 15px;
        font-weight: bold;
        padding: 15px;
        cursor: pointer;
      }

      .pgdc-primary:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      .pgdc [hidden] {
        display: none !important;
      }

    `;

    document.head.appendChild(style);

  }


  /* ======================================================
     07. KHỞI TẠO MODULE
  ====================================================== */

  async function mount(options) {

    assert(options, "Thiếu cấu hình checklist.");

    assert(

      global.PGDDraft &&

      PGDDraft.config.VERSION === "7.5.2",

      "Yêu cầu draft.js phiên bản 7.5.2."

    );

    assert(

      typeof PGDDraft.saveFieldsLocal === "function",

      "draft.js thiếu hàm saveFieldsLocal."

    );

    const container =

      typeof options.container === "string"

        ? document.querySelector(options.container)

        : options.container;

    assert(

      container,

      "Không tìm thấy vùng checklist."

    );

    const context = clone(options.context);

    PGDDraft.makeKey(context);

    const catalog = validateCatalog(

      context.department,

      options.catalog ||

        getCatalog(context.department)

    );

    const isLeader =

      context.department === "TRUONG_CA";

    const testMode = options.testMode === true;

    assert(

      !testMode ||

      /^TEST_/.test(context.employee),

      "Chỉ mã TEST_ được sử dụng chế độ mô phỏng."

    );

    const restored =

      await PGDDraft.restoreLocal(context);

    assert(

      !restored ||

      restored.catalogRevision ===

        CONFIG.CATALOG_REVISION,

      "Bản nháp chưa chuyển đổi danh mục."

    );

    let locked = Boolean(

      restored &&

      !["DRAFT", "REJECTED"].includes(

        restored.status

      )

    );

    let values = normalize(

      context.department,

      restored

        ? (restored.data || {}).checklist || {}

        : {}

    );

    // Các mục nghiệm thu và khóa cửa không được
    // khôi phục thành xác nhận chính thức từ máy khách.

    if (isLeader) {

      Object.keys(APPROVAL_MAP).forEach(

        function (id) {

          values[id] = false;

        }

      );

      values.CL047 = false;

    }

    let evidence = {

      approvals: {},

      photos: {}

    };

    let pending = 0;

    let error = "";

    let destroyed = false;

    let lastSaved = Boolean(restored);

    let queue = Promise.resolve();

    const controls = new Map();

    installStyles();

    container.replaceChildren();

    const root = element("div", "pgdc");

    container.appendChild(root);


    /* ====================================================
       08. TIÊU ĐỀ
    ==================================================== */

    const header = element("div", "pgdc-header");

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

        context.branch + " | " +

        context.shift + " | " +

        context.date

      )

    );

    header.appendChild(

      element(

        "p",

        "",

        "Nhân viên: " + context.employee

      )

    );

    root.appendChild(header);


    /* ====================================================
       09. THANH TIẾN ĐỘ
    ==================================================== */

    const progress = element(

      "div",

      "pgdc-progress"

    );

    const progressTop = element(

      "div",

      "pgdc-progress-top"

    );

    progressTop.appendChild(

      element("span", "", "Tiến độ công việc")

    );

    const progressText = element("span");

    progressTop.appendChild(progressText);

    const track = element("div", "pgdc-track");

    const bar = element("div", "pgdc-bar");

    track.appendChild(bar);

    progress.append(progressTop, track);

    root.appendChild(progress);

    root.appendChild(

      element(

        "div",

        "pgdc-notice",

        "Chỉ xác nhận khi đã trực tiếp thực hiện " +

        "hoặc kiểm tra công việc. Nếu chưa đạt, " +

        "hãy xử lý trước khi đánh dấu hoàn thành."

      )

    );


    /* ====================================================
       10. LƯU BẢN NHÁP
    ==================================================== */

    function save() {

      const snapshot = clone(values);

      if (isLeader) {

        Object.keys(APPROVAL_MAP).forEach(

          function (id) {

            delete snapshot[id];

          }

        );

        // Không lưu xác nhận khóa cửa giả lập.

        delete snapshot.CL047;

      }

      pending++;

      refresh();

      const next = queue.then(function () {

        assert(!error, error);

        return PGDDraft.saveFieldsLocal(

          context,

          {

            checklist: snapshot

          }

        );

      });

      queue = next.then(

        function () {

          pending--;

          lastSaved = true;

          refresh();

        },

        function (failure) {

          pending--;

          error = failure.message ||

            "Không lưu được checklist.";

          refresh();

        }

      );

      return next;

    }


    /* ====================================================
       11. TẠO TỪNG CHECKLIST
    ==================================================== */

    catalog.forEach(function (item, index) {

      if (isLeader && item.id === "CL033") {

        root.appendChild(

          element(

            "div",

            "pgdc-section",

            "1. NGHIỆM THU BỘ PHẬN"

          )

        );

      }

      if (isLeader && item.id === "CL037") {

        root.appendChild(

          element(

            "div",

            "pgdc-section",

            "2. KIỂM TRA VẬN HÀNH"

          )

        );

      }

      if (isLeader && item.id === "CL040") {

        root.appendChild(

          element(

            "div",

            "pgdc-section",

            "3. AN TOÀN CỬA HÀNG"

          )

        );

      }

      if (isLeader && item.id === "CL047") {

        root.appendChild(

          element(

            "div",

            "pgdc-section",

            "4. XÁC NHẬN KHÓA CỬA"

          )

        );

      }

      const label = element(

        "label",

        "pgdc-item"

      );

      const input = element("input");

      input.type = "checkbox";

      const text = element(

        "div",

        "pgdc-item-text",

        (index + 1) + ". " + item.name

      );

      const detail = element(

        "span",

        "pgdc-detail"

      );

      text.appendChild(detail);

      label.append(input, text);

      root.appendChild(label);

      controls.set(item.id, {

        label: label,

        input: input,

        detail: detail

      });

      input.addEventListener(

        "change",

        function () {

          if (

            destroyed ||

            locked ||

            error ||

            item.type === "APPROVAL"

          ) {

            refresh();

            return;

          }

          if (item.type === "FINAL_LOCK") {

            const state = getState();

            if (

              !testMode ||

              !state.readyForLock ||

              evidence.photos.HA014 !== true

            ) {

              refresh();

              return;

            }

            values.CL047 = input.checked;

            refresh();

            return;

          }

          values[item.id] = input.checked;

          // Nếu thay đổi điều kiện trước khóa,
          // phải xác nhận lại bước khóa cửa.

          if (isLeader) {

            values.CL047 = false;

            evidence.photos.HA014 = false;

          }

          save().catch(function () {

            // Lỗi hiển thị trong refresh().

          });

        }

      );

    });


    /* ====================================================
       12. TRẠNG THÁI VÀ NÚT HOÀN THÀNH
    ==================================================== */

    const message = element(

      "div",

      "pgdc-message"

    );

    message.setAttribute("aria-live", "polite");

    const completeButton = element(

      "button",

      "pgdc-primary",

      "Hoàn thành checklist"

    );

    completeButton.type = "button";

    root.append(message, completeButton);


    /* ====================================================
       13. TÍNH TRẠNG THÁI
    ==================================================== */

    function getState() {

      const result = evaluate(

        context.department,

        values,

        testMode ? evidence : {}

      );

      result.pending = pending;

      result.error = error;

      result.locked = locked;

      result.testMode = testMode;

      result.complete =

        result.complete &&

        pending === 0 &&

        !error;

      // Chưa cho chốt trưởng ca thật tại 7.6.

      if (isLeader && !testMode) {

        result.complete = false;

      }

      return result;

    }


    /* ====================================================
       14. CẬP NHẬT GIAO DIỆN
    ==================================================== */

    function refresh() {

      if (destroyed) return;

      const state = getState();

      progressText.textContent =

        state.completed + "/" + state.total;

      bar.style.width =

        Math.round(

          state.completed / state.total * 100

        ) + "%";

      catalog.forEach(function (item) {

        const control = controls.get(item.id);

        const done =

          state.checklist[item.id] === true;

        let disabled =

          locked || Boolean(error);

        let detail = done

          ? "Đã hoàn thành"

          : "Chưa hoàn thành";

        if (item.type === "APPROVAL") {

          disabled = true;

          detail = done

            ? "Đã nghiệm thu - mô phỏng"

            : "Chờ trạng thái nghiệm thu";

        }

        if (item.type === "FINAL_LOCK") {

          disabled =

            disabled ||

            !testMode ||

            !state.readyForLock ||

            evidence.photos.HA014 !== true;

          detail = done

            ? "Đã xác nhận khóa - mô phỏng"

            : "Chờ đủ nghiệm thu, an toàn và ảnh";

        }

        control.input.checked = done;

        control.input.disabled = disabled;

        control.detail.textContent = detail;

        control.label.classList.toggle(

          "done",

          done

        );

        control.label.classList.toggle(

          "blocked",

          disabled && !done

        );

      });

      message.className = "pgdc-message";

      if (error) {

        message.textContent =

          "Lỗi lưu checklist: " + error;

        message.classList.add("error");

      } else if (pending > 0) {

        message.textContent =

          "Đang lưu bản nháp...";

      } else if (locked) {

        message.textContent =

          "Bản nháp đã khóa, chỉ được xem.";

      } else if (lastSaved) {

        message.textContent =

          "✓ Đã lưu checklist trên thiết bị";

        message.classList.add("success");

      } else {

        message.textContent =

          "Chưa phát sinh dữ liệu cần lưu.";

      }

      completeButton.disabled =

        !state.complete || locked;

      completeButton.textContent =

        state.complete

          ? "✓ Hoàn thành checklist"

          : "Hoàn thành checklist (" +

            state.completed + "/" +

            state.total + ")";

      if (locked) {

        completeButton.textContent =

          "Bản nháp đã khóa";

      }

      if (

        typeof options.onChange === "function"

      ) {

        try {

          options.onChange(clone(state));

        } catch (failure) {

          console.error(failure);

        }

      }

    }


    /* ====================================================
       15. CẬP NHẬT DỮ LIỆU MÔ PHỎNG TRƯỞNG CA

       Không lưu trạng thái mô phỏng vào bản nháp.
       Không được dùng làm nghiệm thu thật.
    ==================================================== */

    function setTestEvidence(nextEvidence) {

      assert(

        testMode && isLeader,

        "Chỉ sử dụng trong kiểm thử trưởng ca."

      );

      assert(

        !locked && !destroyed && !error,

        "Module không cho phép thay đổi."

      );

      const incoming = nextEvidence || {};

      const nextApprovals = {};

      Object.values(APPROVAL_MAP).forEach(

        function (department) {

          nextApprovals[department] =

            Boolean(

              incoming.approvals &&

              incoming.approvals[department] === true

            );

        }

      );

      const nextPhotos = {};

      [

        "HA010",

        "HA011",

        "HA012",

        "HA013"

      ].forEach(function (id) {

        nextPhotos[id] = Boolean(

          incoming.photos &&

          incoming.photos[id] === true

        );

      });

      const previousConditions = JSON.stringify({

        approvals: evidence.approvals,

        photos: [

          evidence.photos.HA010 === true,

          evidence.photos.HA011 === true,

          evidence.photos.HA012 === true,

          evidence.photos.HA013 === true

        ]

      });

      const newConditions = JSON.stringify({

        approvals: nextApprovals,

        photos: [

          nextPhotos.HA010,

          nextPhotos.HA011,

          nextPhotos.HA012,

          nextPhotos.HA013

        ]

      });

      const changed =

        previousConditions !== newConditions;

      const previouslyReady = getState().readyForLock;

      nextPhotos.HA014 = Boolean(

        !changed &&

        previouslyReady &&

        incoming.photos &&

        incoming.photos.HA014 === true

      );

      evidence = {

        approvals: nextApprovals,

        photos: nextPhotos

      };

      if (changed || !nextPhotos.HA014) {

        values.CL047 = false;

      }

      refresh();

      return clone(evidence);

    }


    /* ====================================================
       16. HOÀN THÀNH CHECKLIST
    ==================================================== */

    async function flush() {

      await queue;

      assert(!error, error);

      return getState();

    }


    function getData() {

      const state = getState();

      assert(

        state.complete,

        "Chưa hoàn thành toàn bộ checklist."

      );

      return {

        department: context.department,

        checklist: clone(state.checklist),

        completed: state.completed,

        total: state.total,

        testOnly: isLeader

      };

    }


    completeButton.addEventListener(

      "click",

      async function () {

        try {

          await flush();

          const data = getData();

          if (

            typeof options.onComplete === "function"

          ) {

            await options.onComplete(data);

          } else {

            alert(

              "Checklist hợp lệ. " +

              "Chưa gửi báo cáo chính thức."

            );

          }

        } catch (failure) {

          alert(failure.message);

        }

      }

    );


    /* ====================================================
       17. KHÓA VÀ ĐÓNG MODULE
    ==================================================== */

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


    refresh();

    return Object.freeze({

      getState: getState,

      getData: getData,

      flush: flush,

      lock: lock,

      destroy: destroy,

      setTestEvidence: setTestEvidence

    });

  }


  /* ======================================================
     18. KIỂM THỬ LOGIC - 20 BÀI
  ====================================================== */

  function selfTest() {

    let passed = 0;

    const total = 20;

    const results = [];

    function check(name, condition) {

      assert(condition, name);

      passed++;

      results.push(

        "ĐẠT " + passed + " - " + name

      );

    }

    function reject(callback) {

      try {

        callback();

        return false;

      } catch (failure) {

        return true;

      }

    }

    function completeValues(department) {

      const result = {};

      getCatalog(department).forEach(

        item => result[item.id] = true

      );

      return result;

    }

    try {

      check(

        "Tổng 47 checklist",

        CATALOG.length === 47

      );

      check(

        "Không trùng mã",

        new Set(

          CATALOG.map(item => item.id)

        ).size === 47

      );

      check(

        "Bếp phở 7",

        getCatalog("BEP_PHO").length === 7

      );

      check(

        "Bếp vật tư 8",

        getCatalog("BEP_VAT_TU").length === 8

      );

      check(

        "Chạy bàn 8",

        getCatalog("CHAY_BAN").length === 8

      );

      check(

        "Vệ sinh 9",

        getCatalog("VE_SINH").length === 9

      );

      check(

        "Trưởng ca 15",

        getCatalog("TRUONG_CA").length === 15

      );

      check(

        "Mặc định chưa hoàn thành",

        evaluate("BEP_PHO", {}).completed === 0

      );

      check(

        "Hoàn thành đủ 7/7",

        evaluate(

          "BEP_PHO",

          completeValues("BEP_PHO")

        ).complete

      );

      check(

        "Thiếu công việc không hoàn thành",

        !evaluate(

          "BEP_PHO",

          {CL001: true}

        ).complete

      );

      check(

        "Chặn sai bộ phận",

        reject(function () {

          normalize(

            "BEP_PHO",

            {CL008: true}

          );

        })

      );

      check(

        "Chặn dữ liệu chuỗi",

        reject(function () {

          normalize(

            "BEP_PHO",

            {CL001: "true"}

          );

        })

      );

      check(

        "Chặn dữ liệu số",

        reject(function () {

          normalize(

            "BEP_PHO",

            {CL001: 1}

          );

        })

      );

      const leader = completeValues("TRUONG_CA");

      const evidence = {

        approvals: {

          BEP_PHO: true,

          BEP_VAT_TU: true,

          CHAY_BAN: true,

          VE_SINH: true

        },

        photos: {

          HA010: true,

          HA011: true,

          HA012: true,

          HA013: true,

          HA014: true

        }

      };

      check(

        "Không tin nghiệm thu tự tích",

        !evaluate(

          "TRUONG_CA",

          leader,

          {}

        ).checklist.CL033

      );

      const missingApproval = clone(evidence);

      missingApproval.approvals.BEP_PHO = false;

      check(

        "Thiếu nghiệm thu không được khóa",

        !evaluate(

          "TRUONG_CA",

          leader,

          missingApproval

        ).readyForLock

      );

      const missingSafety = clone(leader);

      missingSafety.CL040 = false;

      check(

        "Thiếu kiểm tra an toàn gas",

        !evaluate(

          "TRUONG_CA",

          missingSafety,

          evidence

        ).readyForLock

      );

      const missingPhoto = clone(evidence);

      missingPhoto.photos.HA010 = false;

      check(

        "Thiếu ảnh trước khóa",

        !evaluate(

          "TRUONG_CA",

          leader,

          missingPhoto

        ).readyForLock

      );

      const missingLock = clone(evidence);

      missingLock.photos.HA014 = false;

      check(

        "Thiếu ảnh khóa cửa",

        !evaluate(

          "TRUONG_CA",

          leader,

          missingLock

        ).complete

      );

      check(

        "Đủ điều kiện logic 15/15",

        evaluate(

          "TRUONG_CA",

          leader,

          evidence

        ).complete

      );

      check(

        "Danh mục chính thức hợp lệ",

        validateCatalog(

          "BEP_PHO",

          getCatalog("BEP_PHO")

        ).length === 7

      );

      return {

        success: true,

        passed: passed,

        total: total,

        results: results

      };

    } catch (failure) {

      return {

        success: false,

        passed: passed,

        total: total,

        error: failure.message,

        results: results

      };

    }

  }


  /* ======================================================
     19. XUẤT MODULE
  ====================================================== */

  global.PGDChecklist = Object.freeze({

    config: CONFIG,

    getCatalog: getCatalog,

    validateCatalog: validateCatalog,

    evaluate: evaluate,

    mount: mount,

    selfTest: selfTest

  });

})(window);


/************************************************************
 * KẾT THÚC CHECKLIST.JS
 ************************************************************/
