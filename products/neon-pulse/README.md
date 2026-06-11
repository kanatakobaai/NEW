# NEON PULSE ⚡

片手で遊ぶネオン反射神経アーケード。迫りくる破片を、コアの周りのシールドを回転させて弾くゲーム。

スマホブラウザで動作し、**PWAとしてホーム画面に追加すれば「アプリ」として全画面で遊べます**。同じコードを後から Capacitor でラップすれば iOS/Android のネイティブアプリとして配信も可能。

## 技術的なポイント

- **ビルド不要のバニラJS（ESモジュール）** — フレームワークゼロ、即起動
- **固定タイムステップのゲームループ**（アキュムレータ方式）でフレームレート非依存の安定した物理
- **プール式パーティクルシステム**（1400個を事前確保、GCを発生させない）
- **Web Audio によるプロシージャル効果音**（音声ファイル不要、コンボでピッチ上昇）
- **加算合成（lighter）によるネオングロー表現** + 画面シェイク + ニアミス時のスローモーション
- **DPR対応キャンバス**でRetina解像度に対応
- **PWA**（manifest + service worker でオフライン動作）

## 遊び方

1. 画面をタッチしてコアの周りのシールドを回転
2. 飛来する破片をシールドで弾いてコンボを稼ぐ
3. 破片が1つでもコアに当たればゲームオーバー
4. 時間が経つほど破片の速度と頻度が上昇

## ローカルで動かす

ESモジュールを使うため `file://` ではなく簡易サーバー経由で開く：

```bash
cd products/neon-pulse
python3 -m http.server 8000
# → http://localhost:8000 をスマホ/ブラウザで開く
```

## デプロイ（Vercel）

ビルド設定不要の静的サイト。ディレクトリをそのままデプロイ：

```bash
cd products/neon-pulse
vercel --prod
```

## テスト

```bash
node test/smoke.mjs      # ゲームロジックをヘッドレスで実走検証
node test/gen-icons.mjs  # PWAアイコン（PNG）を再生成
```

## ファイル構成

```
index.html              エントリ・UIオーバーレイ
style.css               ネオンUIスタイル
manifest.json / sw.js   PWA設定
js/main.js              ゲームループ・キャンバス・UI配線
js/engine/
  math.js               角度・補間・乱数ユーティリティ
  particles.js          プール式パーティクル
  audio.js              プロシージャル効果音
  input.js              タッチ/マウス統合入力
js/game/
  game.js               コアゲームロジック・描画
  hazard.js             破片エンティティ
```
