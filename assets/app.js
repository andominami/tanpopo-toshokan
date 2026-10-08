(function () {
  "use strict";

  var bookListEl = document.getElementById("book-list");
  var emptyStateEl = document.getElementById("empty-state");
  var resultCountEl = document.getElementById("result-count");
  var searchInput = document.getElementById("search-input");
  var searchClear = document.getElementById("search-clear");
  var categorySelect = document.getElementById("category-select");
  var sortSelect = document.getElementById("sort-select");
  var loanOnlyCheckbox = document.getElementById("loan-only-checkbox");

  var coverOverlay = document.getElementById("cover-overlay");
  var coverClose = document.getElementById("cover-close");
  var coverImage = document.getElementById("cover-image");
  var coverNo = document.getElementById("cover-no");
  var coverTitle = document.getElementById("cover-title");
  var coverPublished = document.getElementById("cover-published");
  var coverAuthor = document.getElementById("cover-author");
  var coverLoanLink = document.getElementById("cover-loan-link");
  var coverReturnLink = document.getElementById("cover-return-link");

  var LOAN_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdJj40a9sNGseU0InMc5dWAcI2QWwFJl4m2juVu9RDnbazHvA/viewform";
  var LOAN_FORM_NO_ENTRY = "entry.95383657";
  var RETURN_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeRwUKPJD6P2Zq0xQ11YYIkvZOPdC6PMvAG_9GPU78xO5GS3A/viewform";
  var RETURN_FORM_NO_ENTRY = "entry.152102254";

  var books = [];

  var CATEGORY_ORDER = [
    "単行本・その他",
    "補綴臨床",
    "日本歯科評論",
    "歯科衛生士",
    "the Quintessence",
    "nico",
    "DENTAL DIAMOND"
  ];

  fetch("data/books.json")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      books = data;
      populateCategoryOptions();
      render();
    })
    .catch(function (err) {
      bookListEl.innerHTML = "";
      emptyStateEl.hidden = false;
      emptyStateEl.textContent = "本のデータを読み込めませんでした。";
      console.error(err);
    });

  searchInput.addEventListener("input", function () {
    searchClear.classList.toggle("visible", searchInput.value.length > 0);
    render();
  });

  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    searchClear.classList.remove("visible");
    searchInput.focus();
    render();
  });

  categorySelect.addEventListener("change", render);
  sortSelect.addEventListener("change", render);
  loanOnlyCheckbox.addEventListener("change", render);

  function populateCategoryOptions() {
    var present = {};
    books.forEach(function (b) { present[b.category || "単行本・その他"] = true; });
    var ordered = CATEGORY_ORDER.filter(function (c) { return present[c]; });
    Object.keys(present).forEach(function (c) {
      if (ordered.indexOf(c) === -1) ordered.push(c);
    });
    ordered.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      categorySelect.appendChild(opt);
    });
  }

  bookListEl.addEventListener("click", function (e) {
    if (e.target.closest(".book-history")) return; // 貸出履歴の開閉はそのまま
    var card = e.target.closest(".book-card");
    if (!card) return;
    var id = card.getAttribute("data-book-id");
    var book = books.find(function (b) { return String(b.id) === id; });
    if (book) openCover(book);
  });

  function openCover(book) {
    if (book.cover) {
      coverImage.src = book.cover;
      coverImage.alt = book.title;
      coverImage.hidden = false;
    } else {
      coverImage.hidden = true;
    }
    coverNo.textContent = "No." + book.id;
    coverTitle.textContent = book.title;
    if (book.published) {
      coverPublished.textContent = "発行: " + book.published;
      coverPublished.hidden = false;
    } else {
      coverPublished.hidden = true;
    }
    if (book.author) {
      coverAuthor.textContent = book.author;
      coverAuthor.hidden = false;
    } else {
      coverAuthor.hidden = true;
    }
    if (currentLoan(book)) {
      coverLoanLink.hidden = true;
      coverReturnLink.href = RETURN_FORM_URL + "?usp=pp_url&" + RETURN_FORM_NO_ENTRY + "=" + encodeURIComponent(book.id);
      coverReturnLink.hidden = false;
    } else {
      coverLoanLink.href = LOAN_FORM_URL + "?usp=pp_url&" + LOAN_FORM_NO_ENTRY + "=" + encodeURIComponent(book.id);
      coverLoanLink.hidden = false;
      coverReturnLink.hidden = true;
    }
    coverOverlay.hidden = false;
  }

  function closeCover() {
    coverOverlay.hidden = true;
  }

  coverClose.addEventListener("click", closeCover);
  coverOverlay.addEventListener("click", function (e) {
    if (e.target === coverOverlay) closeCover();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !coverOverlay.hidden) closeCover();
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function highlight(text, terms) {
    var escaped = escapeHtml(text);
    if (!terms.length) return escaped;
    var pattern = terms
      .map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); })
      .join("|");
    return escaped.replace(new RegExp("(" + pattern + ")", "gi"), "<mark>$1</mark>");
  }

  // 返却されていない（returnDate が無い）貸出のうち、最新の貸出日のものを「現在の貸出」とする
  function currentLoan(book) {
    var openLoans = (book.loans || []).filter(function (l) { return !l.returnDate; });
    if (!openLoans.length) return null;
    return openLoans.slice().sort(function (a, b) {
      return a.loanDate < b.loanDate ? 1 : -1;
    })[0];
  }

  function historyRows(book) {
    return (book.loans || []).slice().sort(function (a, b) {
      return a.loanDate < b.loanDate ? 1 : -1;
    });
  }

  function formatDate(d) {
    return d || "-";
  }

  var LOAN_PERIOD_DAYS = 7;

  function addDays(dateStr, days) {
    var d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function todayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function render() {
    var query = searchInput.value.trim();
    var terms = query.split(/\s+/).filter(Boolean);
    var category = categorySelect.value;
    var loanOnly = loanOnlyCheckbox.checked;
    var sortMode = sortSelect.value;

    var filtered = books.filter(function (book) {
      if (terms.length) {
        var haystack = (book.title + " " + book.author).toLowerCase();
        if (!terms.every(function (t) { return haystack.indexOf(t.toLowerCase()) !== -1; })) return false;
      }
      if (category && (book.category || "単行本・その他") !== category) return false;
      if (loanOnly && !currentLoan(book)) return false;
      return true;
    });

    if (sortMode === "new") {
      filtered.sort(function (a, b) {
        var aAdded = a.addedAt || "";
        var bAdded = b.addedAt || "";
        if (aAdded !== bAdded) return aAdded < bAdded ? 1 : -1;
        return a.title.localeCompare(b.title, "ja");
      });
    } else if (sortMode === "no") {
      filtered.sort(function (a, b) { return parseInt(a.id, 10) - parseInt(b.id, 10); });
    } else if (sortMode === "loan-first") {
      filtered.sort(function (a, b) {
        var aLoan = currentLoan(a) ? 1 : 0;
        var bLoan = currentLoan(b) ? 1 : 0;
        if (aLoan !== bLoan) return bLoan - aLoan;
        return a.title.localeCompare(b.title, "ja");
      });
    } else {
      filtered.sort(function (a, b) { return a.title.localeCompare(b.title, "ja"); });
    }

    var onLoanCount = books.filter(currentLoan).length;
    resultCountEl.textContent =
      filtered.length + " 冊表示中（全 " + books.length + " 冊 / 貸出中 " + onLoanCount + " 冊）";

    bookListEl.innerHTML = filtered
      .map(function (book) {
        var loan = currentLoan(book);
        var statusHtml;
        if (loan) {
          var dueDate = addDays(loan.loanDate, LOAN_PERIOD_DAYS);
          var overdue = dueDate < todayStr();
          statusHtml =
            '<span class="book-status on-loan">📕 貸出中 — ' +
            escapeHtml(loan.borrower) + "（貸出日: " + escapeHtml(formatDate(loan.loanDate)) + "）</span>" +
            '<span class="due-date' + (overdue ? " overdue" : "") + '">' +
            (overdue ? "⚠️ 返却期限切れ（" : "返却期限: ") + escapeHtml(dueDate) + (overdue ? "）" : "") +
            "</span>";
        } else {
          statusHtml = '<span class="book-status available">📗 在庫あり</span>';
        }

        var rows = historyRows(book);
        var historyHtml = rows.length
          ? '<details class="book-history">' +
            "<summary>貸出履歴を見る（" + rows.length + "件）</summary>" +
            '<table class="history-table"><thead><tr>' +
            "<th>借りた人</th><th>貸出日</th><th>返却日</th>" +
            "</tr></thead><tbody>" +
            rows
              .map(function (l) {
                return (
                  "<tr><td>" + escapeHtml(l.borrower) + "</td><td>" +
                  escapeHtml(formatDate(l.loanDate)) + "</td><td>" +
                  (l.returnDate ? escapeHtml(l.returnDate) : "未返却") +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table></details>"
          : "";

        var authorHtml = book.author
          ? '<p class="book-author">' + highlight(book.author, terms) + "</p>"
          : "";

        var publishedHtml = book.published
          ? '<p class="book-published">発行: ' + escapeHtml(book.published) + "</p>"
          : "";

        var coverHtml = book.cover
          ? '<img class="book-cover" src="' + escapeHtml(book.cover) + '" alt="" loading="lazy">'
          : '<div class="book-cover book-cover-placeholder" aria-hidden="true">📖</div>';

        var categoryHtml = book.category
          ? '<span class="book-category">' + escapeHtml(book.category) + "</span>"
          : "";

        return (
          '<li class="book-card" data-book-id="' + escapeHtml(book.id) + '">' +
          coverHtml +
          '<div class="book-card-body">' +
          '<span class="book-no">No.' + escapeHtml(book.id) + "</span>" +
          categoryHtml +
          '<h2 class="book-title">' + highlight(book.title, terms) + "</h2>" +
          authorHtml +
          publishedHtml +
          statusHtml +
          historyHtml +
          "</div>" +
          "</li>"
        );
      })
      .join("");

    emptyStateEl.hidden = filtered.length > 0;
  }
})();
