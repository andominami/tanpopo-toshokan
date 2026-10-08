/**
 * 「本を登録する」Googleフォームの回答（に紐づくスプレッドシート）から自動で発火し、
 * andominami/tanpopo-toshokan リポジトリの data/books.json に新しい本を追加して、
 * GitHub Pages のサイトへ自動反映するスクリプト。
 *
 * セットアップ手順は automation/README.md を参照。
 *
 * 前提とするフォームの質問（このままの表記でOK。順番は問わない）:
 *   - 本の番号     （記述式・必須。既に使われている番号を入れるとエラーになる）
 *   - タイトル     （記述式・必須）
 *   - 著者        （記述式・任意）
 *   - カテゴリ     （プルダウン・任意。CATEGORIES と同じ選択肢にする）
 *   - 発行日      （記述式・任意。例: 2024年3月）
 *   - 表紙写真     （ファイルのアップロード・任意）
 *
 * 使う前に、スクリプトエディタの「プロジェクトの設定」→「スクリプト プロパティ」に
 * 以下を登録しておくこと（コードに直接書かない）:
 *   GITHUB_TOKEN … リポジトリへの書き込み権限を持つGitHubのアクセストークン
 *   REPO_OWNER   … andominami
 *   REPO_NAME    … tanpopo-toshokan
 */

// フォームの「カテゴリ」プルダウンと合わせること。
const CATEGORIES = [
  "単行本・その他",
  "補綴臨床",
  "日本歯科評論",
  "歯科衛生士",
  "the Quintessence",
  "nico",
  "DENTAL DIAMOND",
];

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

  const bookNo = normalizeBookNo(pick("本の番号"));
  const title = pick("タイトル");
  const author = pick("著者");
  const categoryAnswer = pick("カテゴリ");
  const published = pick("発行日");
  const photoAnswer = pick("表紙写真"); // ファイルアップロード質問はDriveのURLが入る

  if (!bookNo || !title) return; // 必須項目が空の場合は何もしない

  const category = CATEGORIES.includes(categoryAnswer) ? categoryAnswer : "単行本・その他";

  let driveFileIdToClean = null;

  runWithRetry(() => {
    driveFileIdToClean = null;
    const { sha, books } = fetchBooksJson(owner, repo, token);
    if (books.some((b) => String(b.id) === bookNo)) {
      throw new Error(`本の番号 ${bookNo} は既に使われています。別の番号を使ってください。`);
    }
    const id = bookNo;

    const newBook = {
      id,
      title,
      author: author || "",
      category,
      loans: [],
      addedAt: new Date().toISOString(),
    };
    if (published) newBook.published = published;

    if (photoAnswer) {
      const uploaded = uploadCoverPhoto(owner, repo, token, id, photoAnswer);
      if (uploaded) {
        newBook.cover = uploaded.path;
        driveFileIdToClean = uploaded.fileId;
      }
    }

    books.push(newBook);

    putFile(
      owner,
      repo,
      token,
      BOOKS_PATH,
      JSON.stringify(books, null, 2) + "\n",
      `本を登録: No.${id} 「${title}」`,
      sha
    );
  });

  if (driveFileIdToClean) {
    try {
      DriveApp.getFileById(driveFileIdToClean).setTrashed(true);
    } catch (err) {
      console.error(`ドライブの後片付けに失敗(fileId=${driveFileIdToClean}): ${err}`);
    }
  }
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

/** ファイルアップロード質問の回答(DriveのURL)から表紙写真をGitHubへ書き出す */
function uploadCoverPhoto(owner, repo, token, bookId, photoAnswer) {
  const fileId = extractDriveFileId(photoAnswer.split(",")[0].trim());
  if (!fileId) return null;
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const ext = extFromMimeType(blob.getContentType());
  const path = `assets/covers/${bookId}.${ext}`;
  putFile(
    owner,
    repo,
    token,
    path,
    null,
    `表紙を追加 (No.${bookId})`,
    null,
    Utilities.base64Encode(blob.getBytes())
  );
  return { path, fileId };
}

/**
 * GitHubにファイルを作成/更新する。
 * textContent か base64Content のどちらかを渡す。
 * sha を渡すと更新、渡さないと新規作成として扱われる。
 */
function putFile(owner, repo, token, path, textContent, message, sha, base64Content) {
  const content =
    base64Content !== undefined
      ? base64Content
      : Utilities.base64Encode(
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

function extractDriveFileId(url) {
  const m = url.match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

/** 全角数字や「No.」などの余分な文字が入っていても数字部分だけを取り出す */
function normalizeBookNo(raw) {
  const halfWidth = raw.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  const match = halfWidth.match(/\d+/);
  return match ? match[0] : halfWidth.trim();
}

function extFromMimeType(mime) {
  if (mime.indexOf("png") !== -1) return "png";
  if (mime.indexOf("gif") !== -1) return "gif";
  if (mime.indexOf("webp") !== -1) return "webp";
  return "jpg";
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
