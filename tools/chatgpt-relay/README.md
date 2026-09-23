# ChatGPT 中継（relay）

Claude Code が **監督**、ChatGPT が **実作業（設計・企画・実装）** を担当して、指示出しを自動で回す仕組みです。
ChatGPT はふだんのチャット画面のまま動かすので、**ChatGPT のプラン枠だけで使えます（API の従量課金は発生しません）**。

```
Claude Code ──①指示を書く──▶ .relay/inbox/0001.md
     │                               │
     └─②Chrome で短いメッセージを送る─▶ ChatGPT（登録した1つのチャット）
                                     │  Desktop Commander で指示を読み、作業する
Claude Code ◀──③報告を読む── .relay/outbox/0001.md（最終行 STATUS: …）
     │
     └─④ 途中なら「続けて」／完了なら自分でテスト・差分を確認 → コミット → 次の指示
```

## 用意するもの

| もの | 確認すること |
| --- | --- |
| Claude Code | Pro 以上のプランで `/login` していること（Chrome 連携に必要） |
| Google Chrome と [Claude in Chrome 拡張機能](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) | Chrome が起動していること |
| ChatGPT | 作業用のチャットで Desktop Commander が使えること（今の開発と同じ状態） |
| Node.js 18 以上 | `node -v` で確認 |

## はじめての準備（1回だけ）

1. **この仕組みを PC の NEW フォルダに取り込む**
   NEW フォルダで Claude Code を起動し、「`claude/claude-automation-chatgpt-integration-95f0w0` ブランチを取り込んで」と頼みます。
2. **ChatGPT で作業用のチャットを新しく作る**
   ChatGPT で新しいチャットを開き、Desktop Commander を有効にします。試しに「`C:\Users\kanat\claudecodeproject\NEW\README.md` を読んで」と送り、ファイルが読めることを確認します。
   確認できたら、アドレスバーの URL（`https://chatgpt.com/c/...`）をコピーしておきます。
3. **Chrome 連携つきで Claude Code を起動する**（NEW フォルダで）

   ```
   claude --chrome
   ```

4. **頼む**

   ```
   /relay 〇〇を作って
   ```

   初回だけチャットの URL を聞かれるので、2 でコピーした URL を貼ります。
   Chrome の許可を聞かれたら、chatgpt.com を許可します（「このセッションでは常に許可」を選ぶと、途中で止まりません）。

あとは Claude が「設計を頼む → 設計をレビュー → タスクごとに実装を頼む → 自分でテストと差分を確認 → コミット」を繰り返します。

## 他のチャットに影響させないための仕組み

- ChatGPT のカスタム指示・メモリ・プロジェクト設定には一切書き込みません。ルールは `tools/chatgpt-relay/RULES.md` に置き、メッセージで「このチャットの中だけで使い、メモリに保存しない」と毎回伝えます。
- Claude が入力するのは、登録した URL と完全に一致するタブだけです。違うページなら何も入力せずに止まります。
- 入力欄に下書きが残っているときは、消さずに止まります。
- ChatGPT の回答は画面から読みません。結果は報告ファイルだけで受け取ります。画面で確認するのは「応答中かどうか」と「入力欄が空か」だけです。

## 止まるとき

次のときは、Claude が止まってあなたに知らせます。

- git push、デプロイ、公開、お金がかかる操作が必要になったとき
- 同じタスクの修正が 3 回で通らないとき
- 送信の上限（1 回の実行で 30 回）に達したとき
- 報告が来ない、URL が違う、Chrome が応答しないなど、うまく動かないとき

ChatGPT から方針の判断が必要な質問が来たときは、止まらずに Claude が決めて答えます。決めた内容は `operations/decisions/relay-decisions.md` に記録され、終わったときの報告でも一覧で伝えます。

直したり答えたりしたあとで `/relay`（何も付けずに）と送ると、続きから再開します。

## ファイルの場所

| 場所 | 中身 | git |
| --- | --- | --- |
| `tools/chatgpt-relay/relay.mjs` | 中継の道具（報告の待ち受け、送信の上限、送信用コードの作成） | 管理する |
| `tools/chatgpt-relay/RULES.md` | ChatGPT 用の作業ルール（このチャット専用） | 管理する |
| `.claude/skills/relay/SKILL.md` | Claude Code 用の手順（`/relay`） | 管理する |
| `.relay/inbox/` | Claude → ChatGPT の指示 | 対象外 |
| `.relay/outbox/` | ChatGPT → Claude の報告 | 対象外 |
| `.relay/log/` | 報告の控えと、送受信の記録 | 対象外 |
| `.relay/config.json` | チャット URL と各種の上限 | 対象外 |

上限などは `.relay/config.json` で変えられます（例: `"maxSendsPerRun": 30`）。

## うまくいかないとき

| 症状 | 対処 |
| --- | --- |
| `URL_MISMATCH` で止まる | 登録した URL のチャットが開けていません。チャットを変えたときは「relay の URL を変えて」と頼み、新しい URL を渡します |
| `COMPOSER_NOT_EMPTY` で止まる | チャットの入力欄に書きかけの文があります。消してから `/relay` で再開します |
| 報告が来ない（TIMEOUT） | ChatGPT 側でツール実行の確認ボタンが出ていないか、利用上限に達していないか、Desktop Commander がつながっているかを確認します |
| Chrome が反応しない | Claude Code で `/chrome` を開き、「Reconnect extension」を選びます |

## 注意

- 「続けて」などの自動送信は ChatGPT の画面をプログラムで操作するため、OpenAI の想定外の使い方です。アカウントへのリスクはゼロではありません（回答の自動読み取りはしていません）。
- relay で使うチャットには、動いている間は自分で書き込まないでください。
- 動作確認はパソコン上の模擬環境（模擬の報告ファイルと、ChatGPT に似せた画面）で行っています。実際の ChatGPT の画面での通し運転はまだなので、最初は小さなタスクで試してください。

## 開発者向け

```
node tools/chatgpt-relay/relay.mjs            # コマンド一覧
node --test tools/chatgpt-relay/test/relay.test.mjs
```

ChatGPT の画面が変わって送信できなくなったら、`relay.mjs` の `SELECTORS`（入力欄・送信ボタン・停止ボタン）を直します。
