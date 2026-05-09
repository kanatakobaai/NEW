// LINE Flex Message builders - rich card-style UI

function fmt(amount) {
  return `¥${Number(amount).toLocaleString('ja-JP')}`;
}

function invoiceConfirmFlex(parsed) {
  const taxAmount = Math.floor(parsed.amount * parsed.taxRate);
  const total = parsed.amount + taxAmount;
  const hasTax = parsed.taxRate > 0;

  return {
    type: 'flex',
    altText: `請求書確認: ${parsed.clientName} ${fmt(total)}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📄 請求書の内容確認', color: '#ffffff', size: 'sm', weight: 'bold' },
        ],
        backgroundColor: '#2c3e50',
        paddingAll: '14px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '請求先', color: '#888888', size: 'xs', flex: 2 },
              { type: 'text', text: parsed.clientName, color: '#1a1a1a', size: 'sm', weight: 'bold', flex: 5, wrap: true },
            ],
          },
          { type: 'separator', margin: 'sm' },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '件名', color: '#888888', size: 'xs', flex: 2 },
              { type: 'text', text: parsed.description, color: '#1a1a1a', size: 'sm', flex: 5, wrap: true },
            ],
          },
          { type: 'separator', margin: 'sm' },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '小計', color: '#888888', size: 'xs', flex: 2 },
              { type: 'text', text: fmt(parsed.amount), color: '#1a1a1a', size: 'sm', flex: 5, align: 'end' },
            ],
          },
          hasTax ? {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: `消費税 ${parsed.taxRate * 100}%`, color: '#888888', size: 'xs', flex: 2 },
              { type: 'text', text: fmt(taxAmount), color: '#1a1a1a', size: 'sm', flex: 5, align: 'end' },
            ],
          } : null,
          { type: 'separator', margin: 'sm' },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '合計金額', color: '#2c3e50', size: 'sm', weight: 'bold', flex: 2 },
              { type: 'text', text: fmt(total), color: '#e74c3c', size: 'lg', weight: 'bold', flex: 5, align: 'end' },
            ],
          },
        ].filter(Boolean),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button', action: { type: 'message', label: '✅ 作成', text: '作成' },
            style: 'primary', color: '#27ae60', flex: 1, height: 'sm',
          },
          {
            type: 'button', action: { type: 'message', label: '❌ キャンセル', text: 'キャンセル' },
            style: 'secondary', flex: 1, height: 'sm',
          },
        ],
      },
    },
  };
}

function invoiceCreatedFlex(invoiceNumber, clientName, total, downloadUrl, remaining) {
  const remainingText = remaining === Infinity ? '無制限（プレミアム）' : `残り${remaining}回（今月）`;
  return {
    type: 'flex',
    altText: `✅ 請求書 ${invoiceNumber} を作成しました`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '✅ 請求書を作成しました', color: '#ffffff', size: 'sm', weight: 'bold' },
        ],
        backgroundColor: '#27ae60',
        paddingAll: '14px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '請求書番号', color: '#888888', size: 'xs', flex: 3 },
              { type: 'text', text: invoiceNumber, color: '#1a1a1a', size: 'sm', flex: 4 },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '請求先', color: '#888888', size: 'xs', flex: 3 },
              { type: 'text', text: clientName, color: '#1a1a1a', size: 'sm', flex: 4, wrap: true },
            ],
          },
          {
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: '合計金額', color: '#888888', size: 'xs', flex: 3 },
              { type: 'text', text: `¥${Number(total).toLocaleString()}`, color: '#e74c3c', size: 'sm', weight: 'bold', flex: 4 },
            ],
          },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: `今月の利用状況: ${remainingText}`, color: '#888888', size: 'xxs' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '📥 PDFをダウンロード', uri: downloadUrl },
            style: 'primary', color: '#2c3e50',
          },
        ],
      },
    },
  };
}

function premiumUpgradeFlex(checkoutUrl, remaining) {
  return {
    type: 'flex',
    altText: '今月の無料枠を使い切りました',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: '⚠️ 今月の無料枠終了', color: '#ffffff', size: 'sm', weight: 'bold' }],
        backgroundColor: '#e67e22', paddingAll: '14px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm',
        contents: [
          { type: 'text', text: '今月の無料枠（3枚）を使い切りました。', size: 'sm', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '💳 プレミアムプラン', size: 'md', weight: 'bold', color: '#1a1a1a' },
          { type: 'text', text: '月額 ¥980 で無制限に利用できます', size: 'sm', color: '#666666' },
          {
            type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
            contents: [
              { type: 'text', text: '✅ 請求書を無制限に作成', size: 'xs', color: '#27ae60' },
              { type: 'text', text: '✅ 見積書機能（近日追加）', size: 'xs', color: '#27ae60' },
              { type: 'text', text: '✅ PDFダウンロード無制限', size: 'xs', color: '#27ae60' },
            ],
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: '今すぐ登録（月額¥980）', uri: checkoutUrl },
          style: 'primary', color: '#e67e22',
        }],
      },
    },
  };
}

function menuFlex(displayName, remaining) {
  const remainingText = remaining === Infinity ? '無制限（プレミアム）' : `今月あと${remaining}枚無料`;
  return {
    type: 'flex',
    altText: 'フリーランスBotメニュー',
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: `${displayName}さん、こんにちは👋`, color: '#ffffff', size: 'sm' },
          { type: 'text', text: remainingText, color: '#cccccc', size: 'xs' },
        ],
        backgroundColor: '#2c3e50', paddingAll: '14px',
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '📄 請求書を作成する', text: '請求書作成' },
            style: 'primary', color: '#2c3e50',
          },
          {
            type: 'button',
            action: { type: 'message', label: '📊 過去の請求書一覧', text: '履歴' },
            style: 'secondary',
          },
          {
            type: 'button',
            action: { type: 'message', label: '⚙️ 会社名・口座を設定', text: '設定' },
            style: 'secondary',
          },
          remaining < 3 && remaining !== Infinity ? {
            type: 'button',
            action: { type: 'message', label: '💳 プレミアムに登録', text: 'プレミアム' },
            style: 'primary', color: '#e67e22',
          } : null,
        ].filter(Boolean),
      },
    },
  };
}

function quickReply(items) {
  return {
    items: items.map(({ label, text }) => ({
      type: 'action',
      action: { type: 'message', label, text },
    })),
  };
}

module.exports = { invoiceConfirmFlex, invoiceCreatedFlex, premiumUpgradeFlex, menuFlex, quickReply };
