// app.js
(function () {
  const STORAGE_KEYS = {
    SETTINGS: "thrift_scout_settings_v1",
    WATCHLIST: "thrift_scout_watchlist_v1"
  };

  // Current 2026 US seller fees:
  // Depop US: 0% selling fee, 3.3% + $0.45 payment processing fee.
  // Vinted US: 0% seller fee + $0.00 fixed fee (buyer pays protection fee).
  const DEFAULT_SETTINGS = {
    profitTarget: 5.0,
    depopPct: 3.3,
    depopFixed: 0.45,
    vintedPct: 0.0,
    vintedFixed: 0.0,
    defaultShip: 5.75,
    sellerPaysShip: "seller"
  };

  const CATEGORIES = [
    "All",
    "Clothing",
    "Shoes",
    "Accessories & Jewelry",
    "Electronics & Media",
    "Toys & Collectibles",
    "Housewares & Decor",
    "Books & Other"
  ];

  let state = {
    mode: "hot", // "hot" | "all" | "watchlist" | "calc" | "settings"
    selectedCategory: "All",
    searchQuery: "",
    settings: loadSettings(),
    watchlist: loadWatchlist(),
    activeModalItemId: null
  };

  // DOM Elements
  const els = {
    headerCalcBtn: document.getElementById("headerCalcBtn"),
    searchContainer: document.getElementById("searchContainer"),
    searchInput: document.getElementById("searchInput"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    categoryChips: document.getElementById("categoryChips"),
    browseView: document.getElementById("browseView"),
    calcView: document.getElementById("calcView"),
    settingsView: document.getElementById("settingsView"),
    listHeading: document.getElementById("listHeading"),
    listCount: document.getElementById("listCount"),
    itemsGrid: document.getElementById("itemsGrid"),
    dataUpdatedText: document.getElementById("dataUpdatedText"),

    // Calculator
    calcPrefillLabel: document.getElementById("calcPrefillLabel"),
    calcBuyPrice: document.getElementById("calcBuyPrice"),
    calcSalePrice: document.getElementById("calcSalePrice"),
    calcPlatform: document.getElementById("calcPlatform"),
    calcShippingPaidBy: document.getElementById("calcShippingPaidBy"),
    calcShipCost: document.getElementById("calcShipCost"),
    calcResultBox: document.getElementById("calcResultBox"),
    calcNetProfit: document.getElementById("calcNetProfit"),
    calcTargetStatus: document.getElementById("calcTargetStatus"),
    calcFeeOut: document.getElementById("calcFeeOut"),
    calcShipOut: document.getElementById("calcShipOut"),
    calcMaxBuyOut: document.getElementById("calcMaxBuyOut"),

    // Settings
    settingsForm: document.getElementById("settingsForm"),
    setProfitTarget: document.getElementById("setProfitTarget"),
    setDepopPct: document.getElementById("setDepopPct"),
    setDepopFixed: document.getElementById("setDepopFixed"),
    setVintedPct: document.getElementById("setVintedPct"),
    setVintedFixed: document.getElementById("setVintedFixed"),
    setDefaultShip: document.getElementById("setDefaultShip"),
    setSellerPaysShip: document.getElementById("setSellerPaysShip"),
    resetSettingsBtn: document.getElementById("resetSettingsBtn"),
    settingsSavedMsg: document.getElementById("settingsSavedMsg"),

    // Modal
    detailModal: document.getElementById("detailModal"),
    closeModalBtn: document.getElementById("closeModalBtn"),
    modalCategory: document.getElementById("modalCategory"),
    modalTitle: document.getElementById("modalTitle"),
    modalDemand: document.getElementById("modalDemand"),
    modalPlatform: document.getElementById("modalPlatform"),
    modalShipSize: document.getElementById("modalShipSize"),
    modalConfidence: document.getElementById("modalConfidence"),
    modalThriftRange: document.getElementById("modalThriftRange"),
    modalSoldRange: document.getElementById("modalSoldRange"),
    modalMaxPay: document.getElementById("modalMaxPay"),
    modalEstShip: document.getElementById("modalEstShip"),
    modalKeywords: document.getElementById("modalKeywords"),
    modalHowToSpot: document.getElementById("modalHowToSpot"),
    modalWhatToCheck: document.getElementById("modalWhatToCheck"),
    modalCalcBtn: document.getElementById("modalCalcBtn"),
    modalFavBtn: document.getElementById("modalFavBtn"),

    // Nav
    navHot: document.getElementById("navHot"),
    navAll: document.getElementById("navAll"),
    navWatchlist: document.getElementById("navWatchlist"),
    navCalc: document.getElementById("navCalc"),
    navSettings: document.getElementById("navSettings")
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(newSettings) {
    state.settings = { ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
    } catch (e) {
      // Ignore storage quota errors in private mode
    }
  }

  function loadWatchlist() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function toggleWatchlist(itemId) {
    const idx = state.watchlist.indexOf(itemId);
    if (idx === -1) {
      state.watchlist.push(itemId);
    } else {
      state.watchlist.splice(idx, 1);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(state.watchlist));
    } catch (e) {
      // Ignore storage errors
    }
    renderBrowseList();
    if (state.activeModalItemId === itemId) {
      updateModalFavButton(itemId);
    }
  }

  function getPlatformFeeRates(platformName) {
    if (platformName === "Vinted") {
      return {
        pct: Number(state.settings.vintedPct) || 0,
        fixed: Number(state.settings.vintedFixed) || 0
      };
    }
    // For "Depop" or "Both", use Depop fee rates as conservative baseline
    return {
      pct: Number(state.settings.depopPct) || 0,
      fixed: Number(state.settings.depopFixed) || 0
    };
  }

  function calculateEconomics(salePrice, buyPrice, shipCost, platformName, shippingPaidBy) {
    const rates = getPlatformFeeRates(platformName);
    const feeBasis = shippingPaidBy === "seller" ? salePrice : salePrice + shipCost;
    const feeAmount = salePrice > 0 ? (feeBasis * (rates.pct / 100)) + rates.fixed : 0;
    const sellerShipDeduction = shippingPaidBy === "seller" ? shipCost : 0;
    const netRevenueAfterFeesAndShip = salePrice - feeAmount - sellerShipDeduction;
    const netProfit = netRevenueAfterFeesAndShip - buyPrice;
    const maxBuyPrice = Math.max(0, netRevenueAfterFeesAndShip - state.settings.profitTarget);

    return {
      feeAmount,
      sellerShipDeduction,
      netProfit,
      maxBuyPrice
    };
  }

  function getItemMaxBuy(item) {
    const conservativeSale = item.typicalSoldPrice.low;
    const shipCost = item.estShippingCost ?? state.settings.defaultShip;
    const econ = calculateEconomics(
      conservativeSale,
      0,
      shipCost,
      item.bestPlatform,
      state.settings.sellerPaysShip
    );
    return econ.maxBuyPrice;
  }

  function formatMoney(num) {
    return "$" + Number(num).toFixed(2);
  }

  function formatWholeRange(rangeObj) {
    return `$${rangeObj.low}–$${rangeObj.high}`;
  }

  function renderCategoryChips() {
    els.categoryChips.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (state.selectedCategory === cat ? " active" : "");
      btn.textContent = cat;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", state.selectedCategory === cat ? "true" : "false");
      btn.addEventListener("click", () => {
        state.selectedCategory = cat;
        if (state.mode !== "hot" && state.mode !== "all" && state.mode !== "watchlist") {
          setMode("all");
        } else if (state.mode === "hot" && cat !== "All") {
          setMode("all");
        } else {
          renderCategoryChips();
          renderBrowseList();
        }
      });
      els.categoryChips.appendChild(btn);
    });
  }

  function getFilteredItems() {
    const q = state.searchQuery.trim().toLowerCase();
    let list = ITEMS.slice();

    if (state.mode === "watchlist") {
      list = list.filter((item) => state.watchlist.includes(item.id));
    }

    if (state.selectedCategory !== "All") {
      list = list.filter((item) => item.category === state.selectedCategory);
    }

    if (q) {
      list = list.filter((item) => {
        const inName = item.name.toLowerCase().includes(q);
        const inCat = item.category.toLowerCase().includes(q);
        const inKeywords = item.brandsOrKeywords.some((k) => k.toLowerCase().includes(q));
        return inName || inCat || inKeywords;
      });
    }

    list.sort((a, b) => b.demandScore - a.demandScore);

    if (state.mode === "hot" && !q && state.selectedCategory === "All") {
      return list.slice(0, 12);
    }

    return list;
  }

  function renderBrowseList() {
    const items = getFilteredItems();
    const q = state.searchQuery.trim();

    if (q) {
      els.listHeading.textContent = `🔍 Search Results`;
    } else if (state.mode === "hot") {
      els.listHeading.textContent = "🔥 Hot Right Now (Top 12)";
    } else if (state.mode === "watchlist") {
      els.listHeading.textContent = "⭐ Saved Watchlist";
    } else {
      els.listHeading.textContent = state.selectedCategory === "All"
        ? "🧭 All Scouted Items"
        : `📁 ${state.selectedCategory}`;
    }

    els.listCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    els.itemsGrid.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.mode === "watchlist"
        ? "No items starred yet. Tap ☆ on any item card to pin it to your Watchlist."
        : "No matching items found. Try clearing your search or switching category tabs.";
      els.itemsGrid.appendChild(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "item-card";

      const isFav = state.watchlist.includes(item.id);
      const maxBuy = getItemMaxBuy(item);
      const maxBuyDisplay = maxBuy >= 1 ? `$${Math.floor(maxBuy)}` : formatMoney(maxBuy);

      card.innerHTML = `
        <div class="card-top">
          <h3 class="card-title">${escapeHtml(item.name)}</h3>
          <button class="fav-btn" type="button" aria-label="Toggle favorite">
            ${isFav ? "⭐" : "☆"}
          </button>
        </div>
        <div class="badges-row">
          <span class="badge badge-demand">🔥 Demand ${item.demandScore}/10</span>
          <span class="badge badge-platform">📱 ${escapeHtml(item.bestPlatform)}</span>
          <span class="badge badge-cat">${escapeHtml(item.category)}</span>
        </div>
        <div class="card-metrics">
          <div class="metric-box">
            <span class="metric-label">Sold Range</span>
            <span class="metric-val">${formatWholeRange(item.typicalSoldPrice)}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Pay No More Than</span>
            <span class="metric-val pay-max ${maxBuy < item.typicalThriftPrice.low ? "tight" : ""}">
              ${maxBuyDisplay}
            </span>
          </div>
        </div>
      `;

      const favBtn = card.querySelector(".fav-btn");
      favBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWatchlist(item.id);
      });

      card.addEventListener("click", () => {
        openDetailModal(item.id);
      });

      els.itemsGrid.appendChild(card);
    });
  }

  function openDetailModal(itemId) {
    const item = ITEMS.find((i) => i.id === itemId);
    if (!item) return;

    state.activeModalItemId = item.id;
    const maxBuy = getItemMaxBuy(item);

    els.modalCategory.textContent = item.category;
    els.modalTitle.textContent = item.name;
    els.modalDemand.textContent = `🔥 Demand ${item.demandScore}/10`;
    els.modalPlatform.textContent = `Best: ${item.bestPlatform}`;
    els.modalShipSize.textContent = `📦 ${item.shipSize}`;
    els.modalConfidence.textContent = `Confidence: ${item.confidence}`;

    els.modalThriftRange.textContent = formatWholeRange(item.typicalThriftPrice);
    els.modalSoldRange.textContent = formatWholeRange(item.typicalSoldPrice);
    els.modalMaxPay.textContent = formatMoney(maxBuy);
    els.modalEstShip.textContent = formatMoney(item.estShippingCost);

    els.modalKeywords.innerHTML = "";
    item.brandsOrKeywords.forEach((kw) => {
      const span = document.createElement("span");
      span.className = "keyword-tag";
      span.textContent = kw;
      els.modalKeywords.appendChild(span);
    });

    els.modalHowToSpot.textContent = item.howToSpot;
    els.modalWhatToCheck.textContent = item.whatToCheck;

    updateModalFavButton(item.id);
    els.detailModal.classList.add("open");
  }

  function updateModalFavButton(itemId) {
    const isFav = state.watchlist.includes(itemId);
    els.modalFavBtn.textContent = isFav ? "⭐ Saved" : "☆ Save";
  }

  function closeDetailModal() {
    els.detailModal.classList.remove("open");
    state.activeModalItemId = null;
  }

  function openCalculatorWithItem(item) {
    closeDetailModal();
    if (item) {
      els.calcPrefillLabel.textContent = item.name;
      const midThrift = ((item.typicalThriftPrice.low + item.typicalThriftPrice.high) / 2).toFixed(2);
      const midSold = Math.round((item.typicalSoldPrice.low + item.typicalSoldPrice.high) / 2);
      els.calcBuyPrice.value = midThrift;
      els.calcSalePrice.value = midSold;
      els.calcPlatform.value = item.bestPlatform === "Vinted" ? "Vinted" : "Depop";
      els.calcShippingPaidBy.value = state.settings.sellerPaysShip;
      els.calcShipCost.value = Number(item.estShippingCost).toFixed(2);
    }
    setMode("calc");
    updateCalculator();
  }

  function updateCalculator() {
    const buyPrice = parseFloat(els.calcBuyPrice.value) || 0;
    const salePrice = parseFloat(els.calcSalePrice.value) || 0;
    const platform = els.calcPlatform.value;
    const shippingPaidBy = els.calcShippingPaidBy.value;
    const shipCost = parseFloat(els.calcShipCost.value) || 0;

    const econ = calculateEconomics(salePrice, buyPrice, shipCost, platform, shippingPaidBy);
    const meetsTarget = econ.netProfit >= state.settings.profitTarget;

    els.calcNetProfit.textContent = (econ.netProfit >= 0 ? "+" : "-") + formatMoney(Math.abs(econ.netProfit));
    els.calcResultBox.className = "calc-result-box " + (meetsTarget ? "pass" : "fail");
    els.calcTargetStatus.textContent = meetsTarget
      ? `✅ Meets ${formatMoney(state.settings.profitTarget)} target`
      : `❌ Below ${formatMoney(state.settings.profitTarget)} target`;

    els.calcFeeOut.textContent = "-" + formatMoney(econ.feeAmount);
    els.calcShipOut.textContent = "-" + formatMoney(econ.sellerShipDeduction);
    els.calcMaxBuyOut.textContent = formatMoney(econ.maxBuyPrice);
  }

  function populateSettingsForm() {
    els.setProfitTarget.value = state.settings.profitTarget;
    els.setDepopPct.value = state.settings.depopPct;
    els.setDepopFixed.value = state.settings.depopFixed;
    els.setVintedPct.value = state.settings.vintedPct;
    els.setVintedFixed.value = state.settings.vintedFixed;
    els.setDefaultShip.value = state.settings.defaultShip;
    els.setSellerPaysShip.value = state.settings.sellerPaysShip;
  }

  function setMode(newMode) {
    state.mode = newMode;

    const isBrowse = newMode === "hot" || newMode === "all" || newMode === "watchlist";
    els.browseView.classList.toggle("active", isBrowse);
    els.calcView.classList.toggle("active", newMode === "calc");
    els.settingsView.classList.toggle("active", newMode === "settings");
    els.categoryChips.style.display = isBrowse ? "flex" : "none";
    els.searchContainer.style.display = isBrowse ? "flex" : "none";

    els.navHot.classList.toggle("active", newMode === "hot");
    els.navAll.classList.toggle("active", newMode === "all");
    els.navWatchlist.classList.toggle("active", newMode === "watchlist");
    els.navCalc.classList.toggle("active", newMode === "calc");
    els.navSettings.classList.toggle("active", newMode === "settings");

    if (newMode === "hot") {
      state.selectedCategory = "All";
    }

    renderCategoryChips();
    if (isBrowse) {
      renderBrowseList();
    } else if (newMode === "calc") {
      updateCalculator();
    } else if (newMode === "settings") {
      populateSettingsForm();
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initEvents() {
    els.headerCalcBtn.addEventListener("click", () => {
      setMode("calc");
    });

    els.searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      els.clearSearchBtn.style.display = state.searchQuery ? "flex" : "none";
      if (state.mode !== "hot" && state.mode !== "all" && state.mode !== "watchlist") {
        setMode("all");
      } else {
        renderBrowseList();
      }
    });

    els.clearSearchBtn.addEventListener("click", () => {
      state.searchQuery = "";
      els.searchInput.value = "";
      els.clearSearchBtn.style.display = "none";
      renderBrowseList();
    });

    // Bottom Nav
    els.navHot.addEventListener("click", () => setMode("hot"));
    els.navAll.addEventListener("click", () => setMode("all"));
    els.navWatchlist.addEventListener("click", () => setMode("watchlist"));
    els.navCalc.addEventListener("click", () => setMode("calc"));
    els.navSettings.addEventListener("click", () => setMode("settings"));

    // Modal
    els.closeModalBtn.addEventListener("click", closeDetailModal);
    els.detailModal.addEventListener("click", (e) => {
      if (e.target === els.detailModal) closeDetailModal();
    });
    els.modalFavBtn.addEventListener("click", () => {
      if (state.activeModalItemId) toggleWatchlist(state.activeModalItemId);
    });
    els.modalCalcBtn.addEventListener("click", () => {
      const item = ITEMS.find((i) => i.id === state.activeModalItemId);
      openCalculatorWithItem(item);
    });

    // Calculator inputs
    [
      els.calcBuyPrice,
      els.calcSalePrice,
      els.calcPlatform,
      els.calcShippingPaidBy,
      els.calcShipCost
    ].forEach((input) => {
      input.addEventListener("input", updateCalculator);
      input.addEventListener("change", updateCalculator);
    });

    // Settings Form
    els.settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveSettings({
        profitTarget: parseFloat(els.setProfitTarget.value) || 0,
        depopPct: parseFloat(els.setDepopPct.value) || 0,
        depopFixed: parseFloat(els.setDepopFixed.value) || 0,
        vintedPct: parseFloat(els.setVintedPct.value) || 0,
        vintedFixed: parseFloat(els.setVintedFixed.value) || 0,
        defaultShip: parseFloat(els.setDefaultShip.value) || 0,
        sellerPaysShip: els.setSellerPaysShip.value
      });
      els.settingsSavedMsg.style.display = "block";
      setTimeout(() => {
        els.settingsSavedMsg.style.display = "none";
      }, 2500);
      renderBrowseList();
      updateCalculator();
    });

    els.resetSettingsBtn.addEventListener("click", () => {
      saveSettings({ ...DEFAULT_SETTINGS });
      populateSettingsForm();
      renderBrowseList();
      updateCalculator();
    });
  }

  function init() {
    els.dataUpdatedText.textContent = typeof DATA_UPDATED !== "undefined" ? DATA_UPDATED : "Unknown";
    els.calcShipCost.value = Number(state.settings.defaultShip).toFixed(2);
    els.calcShippingPaidBy.value = state.settings.sellerPaysShip;
    renderCategoryChips();
    renderBrowseList();
    updateCalculator();
    initEvents();
  }

  init();
})();
