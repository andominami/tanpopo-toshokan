(function () {
  "use strict";

  var bookListEl = document.getElementById("book-list");
  var emptyStateEl = document.getElementById("empty-state");
  var resultCountEl = document.getElementById("result-count");
  var searchInput = document.getElementById("search-input");
  var searchClear = document.getElementById("search-clear");

  var books = [];

  fetch("data/books.json")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      books = data;
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

  function render() {
    var query = searchInput.value.trim();
    var terms = query.split(/\s+/).filter(Boolean);

    var filtered = books.filter(function (book) {
      if (!terms.length) return true;
      var haystack = (book.title + " " + book.author).toLowerCase();
      return terms.every(function (t) { return haystack.indexOf(t.toLowerCase()) !== -1; });
    });

    filtered.sort(function (a, b) { return a.title.localeCompare(b.title, "ja"); });

    var onLoanCount = books.filter(currentLoan).length;
    resultCountEl.textContent =
      filtered.length + " 冊表示中（全 " + books.length + " 冊 / 貸出中 " + onLoanCount + " 冊）";

    bookListEl.innerHTML = filtered
      .map(function (book) {
        var loan = currentLoan(book);
        var statusHtml = loan
          ? '<span class="book-status on-loan">📕 貸出中 — ' +
            escapeHtml(loan.borrower) + "（貸出日: " + escapeHtml(formatDate(loan.loanDate)) + "）</span>"
          : '<span class="book-status available">📗 在庫あり</span>';

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

        return (
          '<li class="book-card">' +
          '<span class="book-no">No.' + escapeHtml(book.id) + "</span>" +
          '<h2 class="book-title">' + highlight(book.title, terms) + "</h2>" +
          '<p class="book-author">' + highlight(book.author, terms) + "</p>" +
          statusHtml +
          historyHtml +
          "</li>"
        );
      })
      .join("");

    emptyStateEl.hidden = filtered.length > 0;
  }
})();
