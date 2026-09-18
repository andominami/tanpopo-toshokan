/**
 * 「本を返却する」Googleフォームの回答（に紐づくスプレッドシート）から自動で発火し、
 * andominami/tanpopo-toshokan リポジトリの data/books.json の該当する貸出記録に
 * 返却日を記録して、GitHub Pages のサイトへ自動反映するスクリプト。
 *
 * セットアップ手順は automation/README.md を参照。
 *
 * 前提とするフォームの質問（このままの表記でOK）:
 *   - 本の番号 （記述式・必須。サイトに表示されている「No.〇」の数字）
 *
 * 使う前に、スクリプトエディタの「プロジェクトの設定」→「スクリプト プロパティ」に
 * 以下を登録しておくこと（コードに直接書かない）:
 *   GITHUB_TOKEN … リポジトリへの書き込み権限を持つGitHubのアクセストークン
 *   REPO_OWNER   … andominami
 *   REPO_NAME    … tanpopo-toshokan
 */

const BOOKS_PATH = "data/books.json";
const BRANCH = "main";
const MAX_RETRIES = 3;

function onFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("GITHUB_TOKEN");
  const owner = props.getProperty("REPO_OWNER");
  const repo = props.getProperty("REPO_NAME");

  if (!token || !owner || !repo) {
    throw new Error(
      "スクリプトプロパティに GITHUB_TOKEN / REPO_OWNER / REPO_NAME を設定してください。"
    );
  }

  const values = e.namedValues || {};
  const pick = (key) => ((values[key] || [])[0] || "").trim();

  const bookNo = pick("本の番号");
  if (!bookNo) return;

  const returnDate = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");

  runWithRetry(() => {
    const { sha, books } = fetchBooksJson(owner, repo, token);
    const book = books.find((b) => String(b.id) === bookNo);
    if (!book) {
      throw new Error(`本の番号 ${bookNo} が見つかりません。番号を確認してください。`);
    }

    const openLoan = (book.loans || [])
      .filter((l) => !l.returnDate)
      .sort((a, b) => (a.loanDate < b.loanDate ? 1 : -1))[0];

    if (!openLoan) {
      throw new Error(`「${book.title}」（No.${bookNo}）は貸出中の記録がありません。`);
    }

    openLoan.returnDate = returnDate;

    putFile(
      owner,
      repo,
      token,
      BOOKS_PATH,
      JSON.stringify(books, null, 2) + "\n",
      `返却: No.${bookNo} 「${book.title}」（${openLoan.borrower}）`,
      sha
    );
  });
}

/** data/books.json の現在の内容とshaを取得する */
function fetchBooksJson(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${BOOKS_PATH}?ref=${BRANCH}`;
  const res = UrlFetchApp.fetch(url, {
    headers: ghHeaders(token),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`books.jsonの取得に失敗: ${res.getContentText()}`);
  }
  const meta = JSON.parse(res.getContentText());
  const content = Utilities.newBlob(
    Utilities.base64Decode(meta.content.replace(/\n/g, ""))
  ).getDataAsString("UTF-8");
  return { sha: meta.sha, books: JSON.parse(content) };
}

/** GitHubにファイルを作成/更新する。sha を渡すと更新として扱われる。 */
function putFile(owner, repo, token, path, textContent, message, sha) {
  const content = Utilities.base64Encode(
    Utilities.newBlob(textContent, "application/json").getBytes()
  );

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const payload = { message, content, branch: BRANCH };
  if (sha) payload.sha = sha;

  const res = UrlFetchApp.fetch(url, {
    method: "put",
    headers: ghHeaders(token),
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new ConflictOrError(code, res.getContentText());
  }
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

/** data/books.json は複数投稿が重なるとsha競合(409/422)することがあるため、少しだけ再試行する */
function runWithRetry(fn) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      fn();
      return;
    } catch (err) {
      const isConflict = err instanceof ConflictOrError && (err.code === 409 || err.code === 422);
      if (!isConflict || i === MAX_RETRIES - 1) throw err;
      Utilities.sleep(1000 * (i + 1));
    }
  }
}

class ConflictOrError extends Error {
  constructor(code, body) {
    super(`GitHub API error ${code}: ${body}`);
    this.code = code;
  }
}
