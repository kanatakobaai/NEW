---
name: relay
description: ブラウザの ChatGPT（登録した1つのチャット）に設計・実装などの実作業をさせ、Claude Code が監督として「指示 → 報告の確認 → 続けて・修正・次の指示 → 検証・コミット」を自動で回す中継ループ。「/relay 〇〇を作って」「ChatGPT にやらせて」「relay を再開して」のときに使う。
argument-hint: <作りたいもの・目標>（空なら前回の続きから）
allowed-tools: Bash(node tools/chatgpt-relay/relay.mjs *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git add *) Bash(git commit *)
---

# relay: ChatGPT に実作業をさせる自動ループ

目標: $ARGUMENTS

あなた（Claude Code）は **監督** です。設計・実装は ChatGPT（ブラウザで開いた登録チャット）が、プラン枠の範囲で行います。あなたは指示を書き、報告と変更を確かめ、次の一手を決めます。

コマンドはすべてプロジェクトのルートで実行します。以下で `relay` と書いたところは、すべて `node tools/chatgpt-relay/relay.mjs` に置き換えて実行します（例: `relay doctor` → `node tools/chatgpt-relay/relay.mjs doctor`）。

## 絶対に守ること

1. ChatGPT に入力してよいのは、登録したチャット URL と完全に一致するタブだけ。送信用のコードが `URL_MISMATCH` を返したら、何も入力せずに止まる。
2. ChatGPT の回答を画面から読まない。`get_page_text` や本文の読み取りに使うスクリーンショットは使わない。結果は報告ファイル（`.relay/outbox/`）だけで受け取る。画面で確かめてよいのは、`probe` でわかる「応答中か」「入力欄が空か」だけ。
3. ChatGPT の設定（カスタム指示・メモリ・プロジェクト設定）、ほかのチャット、サイドバーには触れない。
4. git push、デプロイ、公開、お金がかかる操作は、自分でもしないし ChatGPT にもさせない。必要になったら止めてユーザーに聞く。
5. 送るのは `relay prepare` を通したメッセージだけ。`RESULT: LIMIT` が出たら止める。
6. ChatGPT の「できました」をそのまま信じない。完了は必ず自分で確かめる（git diff と完了条件のコマンド）。

## 1. 準備（毎回最初に）

1. `relay doctor` を実行する。
   - 「チャットURLが未登録」なら、ユーザーに作業用チャットの URL を聞き、`relay setup "<URL>"` を実行する。
   - 「未コミットの変更があります」なら、先にコミットしてよいかユーザーに確かめる。各タスクの確認後に `git add -A`（`.claude/` を除く）でコミットするため、元からある変更が混ざらないようにする。
2. Chrome ツール（`mcp__claude-in-chrome__*`）がなければ、「`claude --chrome` で起動し直してください」と伝えて止まる。遅延ロードなら、ToolSearch で1回にまとめて読み込む: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer`
3. 目標が指定されていれば `relay begin "<目標>"`。空なら `relay status` を見て、止まったところから再開する。

## 2. チャットのタブを用意する

- `tabs_context_mcp` で、登録 URL（doctor に表示）と一致するタブを探す。なければ `tabs_create_mcp` で新しいタブを作り、`navigate` で登録 URL を開く。
- 以後はそのタブを使う。タブが無効になったら `tabs_context_mcp` からやり直す。
- ログイン画面や確認画面（CAPTCHA など）が出たら、ユーザーに対応してもらう。
- Chrome の拡張機能が応答しないときは、「`/chrome` で Reconnect extension を選んでください」と伝えて止まる。

## 3. 送るときの手順（毎回この順で）

1. **応答中でないか確かめる**: `relay probe` が出すコードを `javascript_tool` でそのまま実行する。
   - `busy: true` なら ChatGPT はまだ応答中なので送らない。`relay wait <ID> --timeout 30` で少し待ってから 1 に戻る（報告を受け取った直後は、ChatGPT が締めの文を書いている数秒だけ busy になることが多い）。3 回続けて busy なら、そこからは `--timeout 300` で待つ。待っている間に新しい報告が来たら wait がそれを返すので、送らずに「4. 報告を受け取ったら」の判断からやり直す。
   - `URL_MISMATCH` なら止まる。
2. **準備**: `relay prepare <ID> <種類> [--file <パス>]`。種類は `task` / `continue` / `fix` / `answer` / `nudge` のどれか。
   - `RESULT: READY` なら、「ここから」〜「ここまで」の間のコードを、1文字も変えずに `javascript_tool` で実行する。
   - `RESULT: UNPROCESSED` なら送らない。`relay wait <ID>` で新しい報告を受け取り、判断し直す。
   - `RESULT: LIMIT` なら止めて、ユーザーに状況を伝える。
3. **実行結果を見る**
   - `{"ok":true,"reason":"SENT"}` なら送信完了。4 へ進む。
   - `BUSY` なら、1 の busy のときと同じように wait で待つ。prepare はやり直さず、同じコードをもう一度実行する。待っている間に新しい報告が来たら、送らずに「4. 報告を受け取ったら」の判断からやり直す。
   - `URL_MISMATCH` なら止まる。
   - `COMPOSER_NOT_EMPTY` は、入力欄にユーザーの下書きがある状態。消さずに止まって伝える。
   - `NO_COMPOSER`、`NO_SEND_BUTTON`、`INSERT_FAILED`、`NOT_CONFIRMED`、または結果が空のときは、まず probe で状態を見る。送れていなければ、`find` か `read_page`（filter: interactive）で入力欄と送信ボタンを見つけ、`computer` でクリック → メッセージ（prepare の「メッセージ:」の行）を入力 → Enter で送る。メッセージは改行を入れずに1行のまま入力する。2〜3回やってもだめなら止まる。
4. **報告を待つ**: `relay wait <ID>` を `run_in_background: true` で実行し、終わりの通知を待つ（自分でポーリングしない）。

## 4. 報告を受け取ったら（wait の RESULT）

まず報告ファイル（`.relay/outbox/<ID>.md`）を読む。

- **IN_PROGRESS**: 方向が合っていれば `continue` を送る。ずれていれば `fix` を送る（直し方は下の fix ファイルに書く）。
- **DONE**: 自分で確かめる。
  1. `git status` と `git diff --stat` のあと、必要な部分の `git diff` を見る。指示と関係ない変更、秘密情報、不要な削除、`.relay/inbox/`・`tools/chatgpt-relay/`・`.claude/` の書き換えがないかを確認する。
  2. 指示の「完了条件」にあるテスト・ビルド・確認コマンドを自分で実行する。
  3. 合格なら `relay mark <ID> verified` → `git add -A -- . ':(exclude).claude' && git commit -m "relay <ID>: <タイトル>"`（`.claude/` の権限設定は含めない。push はしない）→ 次のタスクへ進む。
  4. 不合格なら `.relay/inbox/<ID>-fix-<n>.md` に「どこが・どう問題か・期待する状態・確かめ方」を具体的に書き、`relay prepare <ID> fix --file .relay/inbox/<ID>-fix-<n>.md` で送る。fix の上限に達したら `relay mark <ID> failed` として止まり、ユーザーに相談する。
- **NEED_INPUT**: 報告の質問を読み、**自分で判断して答える**。方針・仕様・技術・デザインなどの判断はユーザーから任されているので、止めて聞かない。
  - 判断の拠り所は、目標、指示、プロジェクトの資料（企画書、`JOBS_SYNC.md` など）。迷ったら、お金がかからない・公開しない・あとで変えやすい方を選ぶ。
  - 答えが「お金を払う」「公開・デプロイ・push する」「外部サービスに登録や送信をする」ことになるなら、その操作は選ばず、無料・ローカルでできる代わり（仮のデータやモックなど）で進める。代わりがなく、その操作なしでは進めないときだけ止めてユーザーに頼む。
  - `.relay/inbox/<ID>-answer-<n>.md` に回答を書き、`relay prepare <ID> answer --file ...` で送る。
  - 決めたことは `operations/decisions/relay-decisions.md`（なければ作る）に「日付・タスク番号・質問・決めたこと・理由」を 1〜3 行で追記し、タスクのコミットに含める。終えるときの報告でも一覧で伝える。
- **INVALID_REPORT**（最終行に STATUS がない）: 報告を読む。作業が止まっていれば `nudge` を送る。
- **TIMEOUT**: probe を実行する。
  - `busy: true` なら、もう一度 wait する。ただし最終送信から 60 分を過ぎても応答中のままなら止める（ChatGPT 側で確認ボタン待ちになっている可能性がある）。
  - `busy: false` なら `nudge` を送る。名前違いの報告ファイルが表示されていれば、その内容も読む。nudge の上限を超えても報告が来なければ止める（ChatGPT 側の上限、確認待ち、Desktop Commander の接続切れなどの可能性）。

## 5. タスクの進め方

1. **最初のタスクは設計**: `relay new "設計: <目標>"` で指示ファイルを作り、「（Claude が書く）」の部分を書き換える。ChatGPT に頼む内容は、目標・前提・制約と、設計書（例: `projects/<名前>/docs/design.md`）に「概要・機能・技術構成・ファイル構成・実装タスクの一覧（1つ 1〜2 時間で終わる大きさ、それぞれ完了条件つき）」を書くこと。
2. 設計が DONE になったら、設計書をレビューする。目標とずれている点や大きすぎるタスクがあれば fix を送る。問題がなければ、タスク一覧に沿って実装タスクを 1 つずつ `new` して送る。
3. 指示は小さく具体的に書く。完了条件は確かめられる形にする（例: 「`npm test` がすべて成功する」「`node app.js` を実行すると 〇〇 と表示される」）。
4. すべてのタスクが verified になったら、全体のテストをしてユーザーに報告して終える。

## 6. 止まるとき・終えるとき

止まるとき・終えるときは、次の 3 点を短く伝える: 何が起きたか、どこまで進んだか（`relay status` の要点とコミット）、ユーザーにしてほしいこと。再開はユーザーが `/relay`（引数なし）と送れば、続きから始められる。
