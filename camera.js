
/************************************************************
 * PHỞ GÀ ĐỒI - SYSTEM V2.0
 * GIAI ĐOẠN 7.7
 * FILE: camera.js
 ************************************************************/

(function (global) {

  "use strict";

  /* ======================================================
     01. CẤU HÌNH
  ====================================================== */

  const CONFIG = Object.freeze({

    VERSION: "7.7",

    CATALOG_REVISION: "751",

    TOTAL_PHOTOS: 14,

    STAFF_PHOTOS: 9,

    LEADER_PHOTOS: 5,

    MAX_IMAGE_WIDTH: 1080,

    MAX_IMAGE_HEIGHT: 1080,

    MAX_PHOTO_LENGTH: 750000,

    JPEG_QUALITY: 0.85,

    MIN_QUALITY: 0.40,

    TIMEZONE: "Asia/Ho_Chi_Minh",

    DEPARTMENTS: {

      BEP_PHO: 2,

      BEP_VAT_TU: 3,

      CHAY_BAN: 2,

      VE_SINH: 2,

      TRUONG_CA: 5

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

    CS1: "CS1 - 28 Võ Chí Công",

    CS2: "CS2 - An Khánh"

  };


  const SHIFT_NAMES = {

    SANG: "Ca sáng",

    TOI: "Ca tối",

    DEM: "Ca đêm"

  };


  /* ======================================================
     02. DANH MỤC ẢNH
  ====================================================== */

  const ROWS = [

    ["HA001", "BEP_PHO",
      "Khu vực làm phở",
      "01_Lam_pho"],

    ["HA002", "BEP_PHO",
      "Tủ lạnh bảo quản",
      "02_Tu_lanh"],

    ["HA003", "BEP_VAT_TU",
      "Khu vực bếp rửa bát",
      "01_Rua_bat"],

    ["HA004", "BEP_VAT_TU",
      "Khu vực giấm + ớt + măng",
      "02_Giam_ot_mang"],

    ["HA005", "BEP_VAT_TU",
      "Khu vực điện và gas",
      "03_Dien_gas"],

    ["HA006", "CHAY_BAN",
      "Đồ đóng gói mang về",
      "01_Do_dong_goi"],

    ["HA007", "CHAY_BAN",
      "Khu vực ngoài sân",
      "02_Ngoai_san"],

    ["HA008", "VE_SINH",
      "Khu vực rác",
      "01_Khu_vuc_rac"],

    ["HA009", "VE_SINH",
      "Nhà vệ sinh",
      "02_Nha_ve_sinh"],

    ["HA010", "TRUONG_CA",
      "Tổng thể khu vực bếp phở",
      "01_Tong_the_bep_pho"],

    ["HA011", "TRUONG_CA",
      "Khu vực bếp vật tư và rửa bát",
      "02_Bep_vat_tu"],

    ["HA012", "TRUONG_CA",
      "Tổng thể khu vực phục vụ khách",
      "03_Khu_vuc_khach"],

    ["HA013", "TRUONG_CA",
      "Khu vực điện và gas",
      "04_An_toan_dien_gas"],

    ["HA014", "TRUONG_CA",
      "Khóa cửa hàng",
      "05_Khoa_cua_hang"]

  ];


  const CATALOG = ROWS.map(function (row) {

    return Object.freeze({

      id: row[0],

      department: row[1],

      name: row[2],

      filename: row[3],

      required: true,

      type: row[0] === "HA014"

        ? "FINAL_LOCK"

        : "NORMAL"

    });

  });


  const PRE_LOCK_PHOTOS = [

    "HA010",

    "HA011",

    "HA012",

    "HA013"

  ];


  const LEADER_MANUAL = [

    "CL037",

    "CL038",

    "CL039",

    "CL040",

    "CL041",

    "CL042",

    "CL043",

    "CL044",

    "CL045",

    "CL046"

  ];


  const APPROVAL_DEPARTMENTS = [

    "BEP_PHO",

    "BEP_VAT_TU",

    "CHAY_BAN",

    "VE_SINH"

  ];


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


  function button(text, className) {

    const node = element(

      "button",

      className || "pgcam-button",

      text

    );

    node.type = "button";

    return node;

  }


  function formatTime(date) {

    return new Intl.DateTimeFormat(

      "vi-VN",

      {

        timeZone: CONFIG.TIMEZONE,

        day: "2-digit",

        month: "2-digit",

        year: "numeric",

        hour: "2-digit",

        minute: "2-digit",

        second: "2-digit",

        hourCycle: "h23"

      }

    ).format(date);

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


  function validatePhotoId(department, id) {

    const item = getCatalog(department).find(

      row => row.id === id

    );

    assert(

      item,

      "Ảnh không thuộc bộ phận."

    );

    return item;

  }


  function validateData(data) {

    assert(

      typeof data === "string" &&

      data.startsWith("data:image/jpeg;base64,"),

      "Ảnh phải là JPEG."

    );

    assert(

      data.length <= CONFIG.MAX_PHOTO_LENGTH,

      "Ảnh vượt quá dung lượng cho phép."

    );

    const bytes = atob(data.split(",")[1]);

    assert(

      bytes.length >= 4 &&

      bytes.charCodeAt(0) === 255 &&

      bytes.charCodeAt(1) === 216 &&

      bytes.charCodeAt(bytes.length - 2) === 255 &&

      bytes.charCodeAt(bytes.length - 1) === 217,

      "Dữ liệu JPEG không hợp lệ."

    );

    return true;

  }


  async function hashText(text) {

    assert(

      global.crypto && global.crypto.subtle,

      "Trình duyệt không hỗ trợ SHA-256."

    );

    const bytes = new TextEncoder().encode(text);

    const result = await crypto.subtle.digest(

      "SHA-256",

      bytes

    );

    return Array.from(

      new Uint8Array(result)

    ).map(

      value => value.toString(16).padStart(2, "0")

    ).join("");

  }


  function hasPhoto(photos, id) {

    return Boolean(

      photos[id] &&

      typeof photos[id].data === "string" &&

      photos[id].data.startsWith(

        "data:image/jpeg;base64,"

      )

    );

  }


  /* ======================================================
     04. KIỂM TRA ĐIỀU KIỆN KHÓA CỬA
  ====================================================== */

  function evaluateLock(checklist, approvals, photos) {

    const allApproved =

      APPROVAL_DEPARTMENTS.every(

        id => approvals[id] === true

      );

    const manualComplete =

      LEADER_MANUAL.every(

        id => checklist[id] === true

      );

    const prePhotosComplete =

      PRE_LOCK_PHOTOS.every(

        id => hasPhoto(photos, id)

      );

    return {

      allApproved: allApproved,

      manualComplete: manualComplete,

      prePhotosComplete: prePhotosComplete,

      ready:

        allApproved &&

        manualComplete &&

        prePhotosComplete

    };

  }


  function evaluate(department, photos) {

    const catalog = getCatalog(department);

    const completed = catalog.filter(

      item => hasPhoto(photos, item.id)

    ).length;

    return {

      completed: completed,

      total: catalog.length,

      complete: completed === catalog.length,

      missing: catalog.filter(

        item => !hasPhoto(photos, item.id)

      )

    };

  }


  /* ======================================================
     05. XỬ LÝ HÌNH ẢNH
  ====================================================== */

  function fitSize(width, height) {

    assert(

      Number.isFinite(width) &&

      Number.isFinite(height) &&

      width > 0 &&

      height > 0,

      "Kích thước ảnh không hợp lệ."

    );

    const ratio = Math.min(

      1,

      CONFIG.MAX_IMAGE_WIDTH / width,

      CONFIG.MAX_IMAGE_HEIGHT / height

    );

    return {

      width: Math.max(1, Math.round(width * ratio)),

      height: Math.max(1, Math.round(height * ratio))

    };

  }


  function fitText(ctx, text, width) {

    let result = String(text);

    while (

      result.length > 1 &&

      ctx.measureText(result).width > width

    ) {

      result = result.slice(0, -1);

    }

    return result === String(text)

      ? result

      : result.slice(0, -1) + "…";

  }


  async function processImage(source, context, item) {

    const originalWidth =

      source.videoWidth || source.width;

    const originalHeight =

      source.videoHeight || source.height;

    const size = fitSize(

      originalWidth,

      originalHeight

    );

    const raw = document.createElement("canvas");

    raw.width = size.width;

    raw.height = size.height;

    const rawCtx = raw.getContext("2d");

    assert(rawCtx, "Không thể xử lý hình ảnh.");

    rawCtx.drawImage(

      source,

      0,

      0,

      size.width,

      size.height

    );

    // Hash trước khi đóng dấu, nhằm phát hiện
    // ảnh giống hệt trong phiên đang mở.

    const sourceHash = await hashText(

      raw.toDataURL("image/jpeg", 0.90)

    );

    const capturedAt = new Date();

    let output = "";

    let scale = 1;

    for (let attempt = 0; attempt < 5; attempt++) {

      const width = Math.max(

        1,

        Math.round(size.width * scale)

      );

      const height = Math.max(

        1,

        Math.round(size.height * scale)

      );

      const fontSize = Math.max(

        12,

        Math.round(width / 43)

      );

      const lineHeight = Math.round(

        fontSize * 1.45

      );

      const footerHeight = lineHeight * 5 + 18;

      const canvas = document.createElement("canvas");

      canvas.width = width;

      canvas.height = height + footerHeight;

      const ctx = canvas.getContext("2d");

      ctx.drawImage(

        raw,

        0,

        0,

        width,

        height

      );

      ctx.fillStyle = "#111111";

      ctx.fillRect(

        0,

        height,

        width,

        footerHeight

      );

      ctx.font = "bold " + fontSize + "px Arial";

      ctx.fillStyle = "#f4e5a4";

      ctx.fillText(

        fitText(

          ctx,

          "PHỞ GÀ ĐỒI | " + item.id,

          width - 20

        ),

        10,

        height + lineHeight

      );

      ctx.font = fontSize + "px Arial";

      ctx.fillStyle = "#ffffff";

      const lines = [

        BRANCH_NAMES[context.branch] ||

          context.branch,

        DEPARTMENT_NAMES[context.department] +

          " | " + context.employee,

        context.date + " | " +

          SHIFT_NAMES[context.shift],

        "Xử lý ảnh: " + formatTime(capturedAt)

      ];

      lines.forEach(function (line, index) {

        ctx.fillText(

          fitText(ctx, line, width - 20),

          10,

          height + lineHeight * (index + 2)

        );

      });

      let quality = CONFIG.JPEG_QUALITY;

      while (quality >= CONFIG.MIN_QUALITY - 0.001) {

        output = canvas.toDataURL(

          "image/jpeg",

          quality

        );

        if (

          output.length <= CONFIG.MAX_PHOTO_LENGTH

        ) {

          validateData(output);

          return {

            data: output,

            sourceHash: sourceHash,

            processedAt: capturedAt.toISOString(),

            width: canvas.width,

            height: canvas.height

          };

        }

        quality -= 0.05;

      }

      scale *= 0.80;

    }

    throw new Error(

      "Không thể nén ảnh xuống dung lượng yêu cầu."

    );

  }


  /* ======================================================
     06. GIAO DIỆN CSS
  ====================================================== */

  function installStyles() {

    if (document.getElementById("pgcam-css")) return;

    const style = document.createElement("style");

    style.id = "pgcam-css";

    style.textContent = `

      .pgcam {
        font-family: Arial, sans-serif;
        color: #222;
      }

      .pgcam * {
        box-sizing: border-box;
      }

      .pgcam-header {
        background: #941c1c;
        color: #f4e5a4;
        padding: 18px;
        border-radius: 12px;
        margin-bottom: 14px;
      }

      .pgcam-header h2 {
        margin: 0 0 7px;
        font-size: 20px;
      }

      .pgcam-header p {
        margin: 4px 0;
        font-size: 13px;
      }

      .pgcam-progress {
        background: #fff;
        border: 1px solid #ddd;
        padding: 14px;
        border-radius: 10px;
        margin-bottom: 14px;
        font-weight: bold;
      }

      .pgcam-track {
        background: #eee;
        height: 9px;
        border-radius: 10px;
        overflow: hidden;
        margin-top: 10px;
      }

      .pgcam-bar {
        background: #27864b;
        height: 100%;
        width: 0;
      }

      .pgcam-card {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 13px;
      }

      .pgcam-card.done {
        border-color: #87b998;
      }

      .pgcam-title {
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 8px;
      }

      .pgcam-status {
        color: #777;
        font-size: 12px;
        margin: 7px 0 12px;
      }

      .pgcam-status.done {
        color: #27864b;
      }

      .pgcam-preview {
        width: 100%;
        max-height: 340px;
        object-fit: contain;
        background: #f1f1f1;
        border-radius: 8px;
        margin-bottom: 10px;
      }

      .pgcam-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 130px;
        background: #f4f4f4;
        border: 1px dashed #bbb;
        border-radius: 8px;
        color: #777;
        font-size: 14px;
        margin-bottom: 10px;
      }

      .pgcam-actions {
        display: flex;
        gap: 8px;
      }

      .pgcam-button {
        flex: 1;
        border: 0;
        background: #941c1c;
        color: #fff;
        padding: 13px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
      }

      .pgcam-secondary {
        flex: 1;
        border: 1px solid #941c1c;
        background: #fff;
        color: #941c1c;
        padding: 12px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
      }

      .pgcam-button:disabled,
      .pgcam-secondary:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      .pgcam-notice {
        background: #fff8e8;
        border: 1px solid #dfc486;
        padding: 12px;
        border-radius: 8px;
        font-size: 13px;
        margin-bottom: 14px;
      }

      .pgcam-message {
        font-size: 13px;
        color: #666;
        margin: 12px 0;
        overflow-wrap: anywhere;
      }

      .pgcam-message.error {
        color: #b92525;
        font-weight: bold;
      }

      .pgcam-message.success {
        color: #27864b;
      }

      .pgcam-modal {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(0,0,0,.92);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 15px;
      }

      .pgcam-modal-inner {
        width: 100%;
        max-width: 620px;
        color: #fff;
      }

      .pgcam-video {
        width: 100%;
        max-height: 65vh;
        object-fit: contain;
        background: #000;
        border-radius: 10px;
        margin: 12px 0;
      }

      .pgcam [hidden],
      .pgcam-modal[hidden] {
        display: none !important;
      }

    `;

    document.head.appendChild(style);

  }


  /* ======================================================
     07. KHỞI TẠO CAMERA MODULE
  ====================================================== */

  async function mount(options) {

    assert(options, "Thiếu cấu hình camera.");

    assert(

      global.PGDDraft &&

      PGDDraft.config.VERSION === "7.5.2",

      "Yêu cầu draft.js 7.5.2."

    );

    const container =

      typeof options.container === "string"

        ? document.querySelector(options.container)

        : options.container;

    assert(container, "Không tìm thấy vùng camera.");

    const context = clone(options.context);

    PGDDraft.makeKey(context);

    const catalog = getCatalog(context.department);

    const isLeader =

      context.department === "TRUONG_CA";

    const testMode = options.testMode === true;

    assert(

      !testMode ||

      /^TEST_/.test(context.employee),

      "Chế độ thử nghiệm yêu cầu mã TEST_."

    );

    const restored =

      await PGDDraft.restoreLocal(context);

    assert(

      !restored ||

      restored.catalogRevision ===

        CONFIG.CATALOG_REVISION,

      "Danh mục bản nháp không tương thích."

    );

    let photos = clone(

      restored ? restored.photos || {} : {}

    );

    let checklist = clone(

      restored

        ? (restored.data || {}).checklist || {}

        : {}

    );

    let approvals = {};

    let locked = Boolean(

      restored &&

      !["DRAFT", "REJECTED"].includes(

        restored.status

      )

    );

    let pending = 0;

    let processing = false;

    let opening = false;

    let destroyed = false;

    let error = "";

    let stream = null;

    let selectedItem = null;

    let modal = null;

    let queue = Promise.resolve();

    let cameraGeneration = 0;

    const rawHashes = new Map();

    const controls = new Map();

    // Ảnh khóa đã lưu từ phiên trước không được
    // coi là xác nhận khóa hợp lệ trong phiên mới.

    let lockValidated = false;

    installStyles();

    container.replaceChildren();

    const root = element("div", "pgcam");

    container.appendChild(root);


    /* ====================================================
       08. TIÊU ĐỀ VÀ TIẾN ĐỘ
    ==================================================== */

    const header = element("div", "pgcam-header");

    header.appendChild(

      element("h2", "", "HÌNH ẢNH BÁO CÁO")

    );

    header.appendChild(

      element(

        "p",

        "",

        DEPARTMENT_NAMES[context.department]

      )

    );

    header.appendChild(

      element(

        "p",

        "",

        BRANCH_NAMES[context.branch] +

        " | " + SHIFT_NAMES[context.shift]

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

    const progress = element(

      "div",

      "pgcam-progress"

    );

    const progressText = element("div");

    const track = element("div", "pgcam-track");

    const bar = element("div", "pgcam-bar");

    track.appendChild(bar);

    progress.append(progressText, track);

    root.appendChild(progress);

    root.appendChild(

      element(

        "div",

        "pgcam-notice",

        "Chụp rõ toàn bộ khu vực được yêu cầu. " +

        "Không chụp lại màn hình hoặc ảnh cũ. " +

        "Ảnh được lưu trên thiết bị trong giai đoạn thử nghiệm."

      )

    );


    /* ====================================================
       09. TẠO THẺ HÌNH ẢNH
    ==================================================== */

    catalog.forEach(function (item, index) {

      const card = element("div", "pgcam-card");

      card.appendChild(

        element(

          "div",

          "pgcam-title",

          (index + 1) + ". " + item.name

        )

      );

      const status = element(

        "div",

        "pgcam-status"

      );

      const image = element(

        "img",

        "pgcam-preview"

      );

      image.alt = item.name;

      image.hidden = true;

      const empty = element(

        "div",

        "pgcam-empty",

        "Chưa có hình ảnh"

      );

      const actions = element(

        "div",

        "pgcam-actions"

      );

      const captureButton = button("Chụp ảnh");

      const deleteButton = button(

        "Xóa ảnh",

        "pgcam-secondary"

      );

      actions.append(captureButton, deleteButton);

      card.append(status, image, empty, actions);

      root.appendChild(card);

      controls.set(item.id, {

        card: card,

        status: status,

        image: image,

        empty: empty,

        capture: captureButton,

        remove: deleteButton

      });

      captureButton.addEventListener(

        "click",

        function () {

          openCamera(item).catch(showError);

        }

      );

      deleteButton.addEventListener(

        "click",

        function () {

          if (!confirm("Bạn muốn xóa ảnh này?")) {

            return;

          }

          removePhoto(item.id).catch(showError);

        }

      );

    });

    const message = element(

      "div",

      "pgcam-message"

    );

    message.setAttribute("aria-live", "polite");

    const completeButton = button(

      "Hoàn thành hình ảnh"

    );

    completeButton.style.width = "100%";

    root.append(message, completeButton);


    /* ====================================================
       10. TRẠNG THÁI MODULE
    ==================================================== */

    function getState() {

      const result = evaluate(

        context.department,

        photos

      );

      const lock = evaluateLock(

        checklist,

        approvals,

        photos

      );

      if (

        isLeader &&

        hasPhoto(photos, "HA014") &&

        !lockValidated

      ) {

        result.completed--;

      }

      result.pending = pending;

      result.processing = processing || opening;

      result.cameraOpen = Boolean(modal);

      result.locked = locked;

      result.error = error;

      result.readyForLock =

        isLeader &&

        testMode &&

        lock.ready;

      result.complete =

        result.completed === result.total &&

        pending === 0 &&

        !processing &&

        !opening &&

        !modal &&

        !error;

      if (isLeader) {

        result.complete =

          result.complete &&

          testMode &&

          lock.ready &&

          lockValidated;

      }

      return result;

    }


    function refresh() {

      if (destroyed) return;

      const state = getState();

      const busy =

        pending > 0 ||

        processing ||

        opening ||

        Boolean(modal);

      progressText.textContent =

        "Hình ảnh: " +

        state.completed + "/" + state.total;

      bar.style.width =

        Math.round(

          state.completed / state.total * 100

        ) + "%";

      catalog.forEach(function (item) {

        const control = controls.get(item.id);

        const exists = hasPhoto(photos, item.id);

        const valid =

          exists &&

          (

            item.id !== "HA014" ||

            lockValidated

          );

        control.card.classList.toggle(

          "done",

          valid

        );

        control.image.hidden = !exists;

        control.empty.hidden = exists;

        if (exists) {

          if (

            control.image.getAttribute("src") !==

            photos[item.id].data

          ) {

            control.image.src = photos[item.id].data;

          }

        } else {

          control.image.removeAttribute("src");

        }

        control.status.textContent = valid

          ? "✓ Đã lưu hình ảnh"

          : exists

            ? "Cần chụp lại ảnh khóa cửa"

            : "Chưa hoàn thành";

        control.status.classList.toggle(

          "done",

          valid

        );

        control.capture.textContent = exists

          ? "Chụp lại"

          : "Chụp ảnh";

        control.capture.disabled =

          locked || busy || Boolean(error);

        control.remove.disabled =

          locked || busy || Boolean(error);

        control.remove.hidden = !exists;

        if (

          item.id === "HA014" &&

          !state.readyForLock

        ) {

          control.capture.disabled = true;

          control.status.textContent =

            "Chờ nghiệm thu, an toàn và 4 ảnh đầu";

        }

      });

      message.className = "pgcam-message";

      if (error) {

        message.textContent = error;

        message.classList.add("error");

      } else if (processing || pending > 0) {

        message.textContent =

          "Đang xử lý và lưu ảnh...";

      } else if (opening) {

        message.textContent =

          "Đang mở camera...";

      } else if (locked) {

        message.textContent =

          "Bản nháp đã khóa.";

      } else if (state.completed > 0) {

        message.textContent =

          "✓ Hình ảnh đã lưu trên thiết bị";

        message.classList.add("success");

      } else {

        message.textContent =

          "Chụp từng khu vực theo yêu cầu.";

      }

      completeButton.disabled =

        !state.complete || locked;

      completeButton.textContent =

        state.complete

          ? "✓ Hoàn thành hình ảnh"

          : "Hoàn thành hình ảnh (" +

            state.completed + "/" +

            state.total + ")";

      if (typeof options.onChange === "function") {

        try {

          options.onChange(clone(state));

        } catch (failure) {

          console.error(failure);

        }

      }

    }


    function showError(failure) {

      message.textContent =

        failure.message || String(failure);

      message.className = "pgcam-message error";

    }


    /* ====================================================
       11. HÀNG ĐỢI LƯU ẢNH
    ==================================================== */

    function enqueue(callback) {

      pending++;

      refresh();

      const next = queue.then(function () {

        assert(!error, error);

        return callback();

      });

      queue = next.then(

        function () {

          pending--;

          refresh();

        },

        function (failure) {

          pending--;

          error = failure.message ||

            "Không lưu được ảnh.";

          refresh();

        }

      );

      return next;

    }


    async function reloadDraft() {

      const latest =

        await PGDDraft.restoreLocal(context);

      photos = clone(

        latest ? latest.photos || {} : {}

      );

      checklist = clone(

        latest

          ? (latest.data || {}).checklist || {}

          : {}

      );

      if (

        latest &&

        !["DRAFT", "REJECTED"].includes(latest.status)

      ) {

        locked = true;

      }

      return latest;

    }


    async function invalidateLockPhoto() {

      if (!isLeader) return;

      lockValidated = false;

      rawHashes.delete("HA014");

      if (hasPhoto(photos, "HA014")) {

        await PGDDraft.removePhotoLocal(

          context,

          "HA014"

        );

        await reloadDraft();

      }

      await PGDDraft.saveFieldsLocal(

        context,

        {

          checklist: Object.assign(

            {},

            checklist,

            {CL047: false}

          )

        }

      );

      await reloadDraft();

    }


    /* ====================================================
       12. ĐÓNG CAMERA
    ==================================================== */

    function closeCamera() {

      cameraGeneration++;

      if (stream) {

        stream.getTracks().forEach(

          track => track.stop()

        );

      }

      stream = null;

      selectedItem = null;

      opening = false;

      if (modal) {

        const video = modal.querySelector("video");

        if (video) {

          video.srcObject = null;

        }

        modal.remove();

        modal = null;

      }

      refresh();

    }


    /* ====================================================
       13. MỞ CAMERA TRỰC TIẾP
    ==================================================== */

    async function openCamera(item) {

      assert(

        !locked &&

        !destroyed &&

        !processing &&

        !opening &&

        !modal &&

        pending === 0 &&

        !error,

        "Camera đang bận hoặc bản nháp đã khóa."

      );

      assert(

        global.isSecureContext &&

        navigator.mediaDevices &&

        navigator.mediaDevices.getUserMedia,

        "Cần mở website HTTPS trên trình duyệt hỗ trợ camera."

      );

      validatePhotoId(

        context.department,

        item.id

      );

      if (item.id === "HA014") {

        assert(

          getState().readyForLock,

          "Chưa đủ điều kiện chụp ảnh khóa cửa."

        );

      }

      selectedItem = item;

      opening = true;

      const generation = ++cameraGeneration;

      modal = element("div", "pgcam-modal");

      const inner = element(

        "div",

        "pgcam-modal-inner"

      );

      inner.appendChild(

        element(

          "div",

          "pgcam-title",

          item.name

        )

      );

      const video = element("video", "pgcam-video");

      video.autoplay = true;

      video.playsInline = true;

      video.muted = true;

      video.setAttribute("playsinline", "");

      const actions = element(

        "div",

        "pgcam-actions"

      );

      const shutter = button("CHỤP ẢNH");

      shutter.disabled = true;

      const cancel = button(

        "Hủy",

        "pgcam-secondary"

      );

      actions.append(shutter, cancel);

      inner.append(video, actions);

      modal.appendChild(inner);

      document.body.appendChild(modal);

      cancel.addEventListener(

        "click",

        closeCamera

      );

      shutter.addEventListener(

        "click",

        function () {

          shutter.disabled = true;

          captureFrame(video).catch(showError);

        }

      );

      refresh();

      try {

        const incoming =

          await navigator.mediaDevices.getUserMedia({

            audio: false,

            video: {

              facingMode: {ideal: "environment"},

              width: {ideal: 1920},

              height: {ideal: 1080}

            }

          });

        if (

          destroyed ||

          generation !== cameraGeneration ||

          !modal

        ) {

          incoming.getTracks().forEach(

            track => track.stop()

          );

          return;

        }

        stream = incoming;

        video.srcObject = stream;

        await video.play();

        if (

          generation !== cameraGeneration ||

          destroyed

        ) return;

        opening = false;

        if (video.videoWidth > 0) {

          shutter.disabled = false;

        } else {

          video.addEventListener(

            "loadeddata",

            function () {

              shutter.disabled = false;

            },

            {once: true}

          );

        }

        refresh();

      } catch (failure) {

        if (generation === cameraGeneration) {

          closeCamera();

          throw new Error(

            "Không mở được camera: " +

            failure.message +

            ". Kiểm tra quyền truy cập camera."

          );

        }

      }

    }


    /* ====================================================
       14. CHỤP VÀ LƯU ẢNH
    ==================================================== */

    async function captureFrame(video) {

      assert(

        selectedItem &&

        video.videoWidth > 0 &&

        !processing &&

        !locked,

        "Camera chưa sẵn sàng."

      );

      const item = selectedItem;

      const generation = cameraGeneration;

      processing = true;

      refresh();

      try {

        const result = await processImage(

          video,

          context,

          item

        );

        if (

          destroyed ||

          generation !== cameraGeneration

        ) return;

        closeCamera();

        await enqueue(async function () {

          await reloadDraft();

          assert(!locked, "Bản nháp đã khóa.");

          for (const [id, hash] of rawHashes) {

            assert(

              id === item.id ||

              hash !== result.sourceHash,

              "Ảnh giống hệt hạng mục " + id

            );

          }

          Object.keys(photos).forEach(function (id) {

            if (id === item.id) return;

            assert(

              photos[id].data !== result.data,

              "Ảnh đã tồn tại tại " + id

            );

          });

          if (item.id === "HA014") {

            assert(

              testMode &&

              evaluateLock(

                checklist,

                approvals,

                photos

              ).ready,

              "Điều kiện khóa cửa đã thay đổi."

            );

          } else if (isLeader) {

            await invalidateLockPhoto();

          }

          await PGDDraft.savePhotoLocal(

            context,

            item.id,

            result.data

          );

          rawHashes.set(

            item.id,

            result.sourceHash

          );

          await reloadDraft();

          if (item.id === "HA014") {

            lockValidated = true;

          }

        });

      } finally {

        if (modal) {

          closeCamera();

        }

        processing = false;

        refresh();

      }

    }


    /* ====================================================
       15. XÓA ẢNH
    ==================================================== */

    async function removePhoto(id) {

      assert(

        !locked &&

        !destroyed &&

        !processing &&

        !opening &&

        !modal &&

        pending === 0 &&

        !error,

        "Không thể xóa ảnh lúc này."

      );

      validatePhotoId(context.department, id);

      await enqueue(async function () {

        await reloadDraft();

        assert(!locked, "Bản nháp đã khóa.");

        if (isLeader) {

          await invalidateLockPhoto();

        }

        await PGDDraft.removePhotoLocal(

          context,

          id

        );

        rawHashes.delete(id);

        await reloadDraft();

      });

    }


    /* ====================================================
       16. NGHIỆM THU MÔ PHỎNG

       Không lưu approvals vào bản nháp.
    ==================================================== */

    async function setTestApprovals(values) {

      assert(

        testMode && isLeader,

        "Chỉ dành cho kiểm thử trưởng ca."

      );

      assert(

        !locked &&

        !destroyed &&

        !processing &&

        !opening &&

        !modal &&

        pending === 0 &&

        !error,

        "Module đang bận."

      );

      const next = {};

      APPROVAL_DEPARTMENTS.forEach(function (id) {

        next[id] = values[id] === true;

      });

      const changed = APPROVAL_DEPARTMENTS.some(

        id =>

          (approvals[id] === true) !==

          (next[id] === true)

      );

      if (changed) {

        await enqueue(async function () {

          await reloadDraft();

          assert(!locked, "Bản nháp đã khóa.");

          await invalidateLockPhoto();

          approvals = next;

        });

      }

      refresh();

      return getState();

    }


    /* ====================================================
       17. HOÀN THÀNH
    ==================================================== */

    async function flush() {

      assert(

        !processing && !opening && !modal,

        "Hãy đóng camera và chờ xử lý ảnh."

      );

      await queue;

      assert(!error, error);

      return getState();

    }


    function getData() {

      const state = getState();

      assert(

        state.complete,

        "Chưa đủ hình ảnh bắt buộc."

      );

      const result = {};

      catalog.forEach(function (item) {

        result[item.id] = clone(

          photos[item.id]

        );

      });

      return {

        department: context.department,

        completed: state.completed,

        total: state.total,

        photos: result,

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

              "Đã đủ hình ảnh. Chưa gửi máy chủ."

            );

          }

        } catch (failure) {

          showError(failure);

        }

      }

    );


    /* ====================================================
       18. GIẢI PHÓNG CAMERA
    ==================================================== */

    function onPageHide() {

      closeCamera();

    }


    function onVisibilityChange() {

      if (document.hidden && modal) {

        closeCamera();

      }

    }


    global.addEventListener(

      "pagehide",

      onPageHide

    );

    document.addEventListener(

      "visibilitychange",

      onVisibilityChange

    );


    async function lock() {

      await flush();

      locked = true;

      refresh();

    }


    async function destroy() {

      await flush();

      closeCamera();

      destroyed = true;

      global.removeEventListener(

        "pagehide",

        onPageHide

      );

      document.removeEventListener(

        "visibilitychange",

        onVisibilityChange

      );

      container.replaceChildren();

    }


    refresh();

    return Object.freeze({

      getState: getState,

      getData: getData,

      flush: flush,

      lock: lock,

      destroy: destroy,

      setTestApprovals: setTestApprovals

    });

  }


  /* ======================================================
     19. KIỂM THỬ TỰ ĐỘNG - 20 BÀI
  ====================================================== */

  async function selfTest() {

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

    try {

      check(

        "Tổng 14 ảnh",

        CATALOG.length === 14

      );

      check(

        "Không trùng mã",

        new Set(

          CATALOG.map(item => item.id)

        ).size === 14

      );

      check(

        "Bếp phở 2 ảnh",

        getCatalog("BEP_PHO").length === 2

      );

      check(

        "Bếp vật tư 3 ảnh",

        getCatalog("BEP_VAT_TU").length === 3

      );

      check(

        "Chạy bàn 2 ảnh",

        getCatalog("CHAY_BAN").length === 2

      );

      check(

        "Vệ sinh 2 ảnh",

        getCatalog("VE_SINH").length === 2

      );

      check(

        "Trưởng ca 5 ảnh",

        getCatalog("TRUONG_CA").length === 5

      );

      check(

        "Chặn ảnh sai bộ phận",

        reject(function () {

          validatePhotoId("BEP_PHO", "HA003");

        })

      );

      check(

        "Chặn PNG",

        reject(function () {

          validateData("data:image/png;base64,AAAA");

        })

      );

      check(

        "Chặn ảnh quá lớn",

        reject(function () {

          validateData(

            "data:image/jpeg;base64," +

            "A".repeat(750001)

          );

        })

      );

      check(

        "Nén ảnh ngang đúng tỷ lệ",

        fitSize(4000, 2000).width === 1080 &&

        fitSize(4000, 2000).height === 540

      );

      check(

        "Nén ảnh dọc đúng tỷ lệ",

        fitSize(2000, 4000).height === 1080

      );

      const canvas = document.createElement("canvas");

      canvas.width = 640;

      canvas.height = 480;

      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#941c1c";

      ctx.fillRect(0, 0, 640, 480);

      const context = {

        date: "2026-01-01",

        branch: "CS1",

        shift: "TOI",

        department: "BEP_PHO",

        employee: "TEST_CAMERA"

      };

      const photo = await processImage(

        canvas,

        context,

        getCatalog("BEP_PHO")[0]

      );

      check(

        "Ảnh sau xử lý là JPEG",

        validateData(photo.data)

      );

      check(

        "Ảnh không vượt dung lượng",

        photo.data.length <= 750000

      );

      check(

        "Ảnh có thêm vùng đóng dấu",

        photo.height > 480

      );

      check(

        "Hash SHA-256 hợp lệ",

        /^[a-f0-9]{64}$/.test(photo.sourceHash)

      );

      check(

        "Thiếu ảnh không hoàn thành",

        !evaluate(

          "BEP_PHO",

          {HA001: {data: photo.data}}

        ).complete

      );

      const checklist = {};

      LEADER_MANUAL.forEach(

        id => checklist[id] = true

      );

      const approvals = {};

      APPROVAL_DEPARTMENTS.forEach(

        id => approvals[id] = true

      );

      const photos = {};

      PRE_LOCK_PHOTOS.forEach(

        id => photos[id] = {data: photo.data}

      );

      check(

        "Thiếu nghiệm thu không mở khóa",

        !evaluateLock(

          checklist,

          {},

          photos

        ).ready

      );

      check(

        "Thiếu kiểm tra gas không mở khóa",

        !evaluateLock(

          Object.assign(

            {}, checklist, {CL040: false}

          ),

          approvals,

          photos

        ).ready

      );

      check(

        "Đủ điều kiện logic mở khóa",

        evaluateLock(

          checklist,

          approvals,

          photos

        ).ready

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

        results: results,

        error: failure.message

      };

    }

  }


  /* ======================================================
     20. XUẤT MODULE
  ====================================================== */

  global.PGDCamera = Object.freeze({

    config: CONFIG,

    getCatalog: getCatalog,

    validatePhotoId: validatePhotoId,

    validateData: validateData,

    evaluate: evaluate,

    evaluateLock: evaluateLock,

    processImage: processImage,

    mount: mount,

    selfTest: selfTest

  });

})(window);


/************************************************************
 * KẾT THÚC CAMERA.JS
 ************************************************************/
