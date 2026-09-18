# 医院図書室

医院にある本を一覧・検索でき、貸出状況（貸出日・借りた人・返却日）が分かる、
ビルド不要の静的サイトです。GitHub Pages でそのまま公開できます。

## サイトの機能

- 本の一覧表示（本の番号「No.◯」・タイトル・著者）
- キーワード検索（タイトル・著者を対象、スペース区切りでAND検索、検索語をハイライト表示）
- 貸出状況を一目で表示（在庫あり / 貸出中: 借りた人・貸出日）
- 本ごとに過去の貸出履歴（借りた人・貸出日・返却日）を全件表示
- Googleフォームからの貸出・返却の自動反映（`automation/` 参照、要セットアップ）

## 使い方（ローカル確認）

ビルド不要です。リポジトリ直下で簡易サーバーを立てて `index.html` を開くだけで動作します。

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

（`fetch` で `data/books.json` を読み込むため、`file://` で直接開くとブラウザによっては
CORS エラーになります。必ずローカルサーバー経由で確認してください。）

## ディレクトリ構成

```
index.html            サイト本体（1ページのみ）
assets/style.css       スタイル
assets/app.js          検索・貸出状況の表示ロジック
data/books.json         表示用データ（サイトが実際に読み込むファイル）
.github/workflows/pages.yml  GitHub Pages への自動デプロイ設定
automation/            Googleフォーム（貸出・返却）から自動反映するための設定
```

## 本を追加・更新する方法

`data/books.json` を直接編集します。各本は次の形の JSON オブジェクトです。

```json
{
  "id": "1",
  "title": "本のタイトル",
  "author": "著者名",
  "loans": [
    { "borrower": "借りた人の名前", "loanDate": "2026-09-01", "returnDate": "2026-09-10" },
    { "borrower": "借りた人の名前", "loanDate": "2026-09-15", "returnDate": null }
  ]
}
```

- `loans` はその本の貸出履歴を**すべて**残した配列です。古い履歴も削除せずに追記していきます。
- 返却されていない貸出は `returnDate` を `null` にします（返却されたら日付を入れます）。
- 新しく本を貸し出すときは、その本の `loans` 配列の末尾に
  `{ "borrower": "...", "loanDate": "今日の日付", "returnDate": null }` を追加してください。
- 返却されたときは、対応する貸出の `returnDate` に返却日を入れてください。
- 新しい本を追加するときは、配列の末尾に `id`（他と重複しない値でOK）・`title`・`author`・
  `loans: []` を持つオブジェクトを追加してください。
- `id` はサイト上で「No.◯」として表示される、その本を指す番号です。

差分を確認して commit / push すると、サイトに反映されます。

### GitHubの操作に慣れていない場合

- Claude（Claude Code）のチャットで「この本を貸し出して」「この本が返却された」
  「この本を追加して」などと伝えてもらえれば、代わりにサイトへの反映・公開まで対応できます。
- または、Googleフォームで「本の番号」と「借りた人の名前」を入力するだけで
  自動反映される仕組みを用意できます。設定方法は `automation/README.md` を参照してください。

## GitHub Pages で公開する

1. GitHub のリポジトリ設定 → **Settings → Pages** を開く。
2. **Source** を `GitHub Actions` に設定する。
3. `main` ブランチに push すると `.github/workflows/pages.yml` が自動でデプロイする。
