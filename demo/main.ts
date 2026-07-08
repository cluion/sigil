// Sigil demo，createEditor() 於此掛載

const app = document.getElementById('app')
if (app) {
  const h1 = document.createElement('h1')
  h1.textContent = 'Sigil — 編輯器骨架'

  const p = document.createElement('p')
  p.textContent = '工具鏈就緒：install／test／build／lint／size 全綠，createEditor() 待實作'

  app.append(h1, p)
}
