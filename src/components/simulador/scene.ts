// Cena de exemplo desenhada em canvas (porte de scene.js). Só roda no navegador.
export function makeScene(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1050;
  const c = canvas.getContext("2d")!;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const line = (x: number, y: number, x2: number, y2: number, color: string, width = 2) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x2, y2);
    c.stroke();
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, col: string, rotation = 0) => {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    c.fill();
  };
  const text = (t: string, x: number, y: number, size: number, col = "#3d4940", font = "Georgia") => {
    c.fillStyle = col;
    c.font = `${size}px ${font}`;
    c.fillText(t, x, y);
  };
  let grad = c.createLinearGradient(0, 0, 1600, 900);
  grad.addColorStop(0, "#e1d9c8");
  grad.addColorStop(1, "#f2eee3");
  c.fillStyle = grad;
  c.fillRect(0, 0, 1600, 1050);
  rect(85, 65, 470, 490, "#abb8a5");
  rect(100, 80, 440, 460, "#dbe5d6");
  const sky = c.createLinearGradient(0, 80, 0, 540);
  sky.addColorStop(0, "#bbcfd0");
  sky.addColorStop(1, "#eceddf");
  c.fillStyle = sky;
  c.fillRect(102, 82, 436, 456);
  rect(131, 300, 108, 238, "#c5c7b5");
  rect(265, 240, 90, 298, "#cdd1bc");
  rect(369, 330, 120, 208, "#b9c3b0");
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) rect(144 + j * 29, 319 + i * 38, 13, 20, "#95a697");
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) rect(283 + j * 36, 260 + i * 38, 16, 22, "#a9b7aa");
  for (let i = 0; i < 3; i++) line(105, 200 + i * 110, 540, 200 + i * 110, "#f6f3e8", 12);
  line(319, 80, 319, 540, "#f6f3e8", 14);
  rect(65, 548, 510, 17, "#c5b69c");
  // Quadro e detalhes da parede.
  rect(677, 99, 257, 261, "#9b896d");
  rect(687, 109, 237, 241, "#f6f2e7");
  ellipse(805, 193, 55, 55, "#c3cbaa");
  line(743, 273, 864, 273, "#83937a", 2);
  text("OUTROS OLHARES", 722, 315, 17, "#737866", "Arial");
  // Estante alta, com bordas finas que evidenciam a distorção.
  rect(1070, 36, 427, 627, "#ae9c7e");
  rect(1085, 49, 397, 604, "#c4b699");
  const colors = ["#8d9b80", "#ddd0a9", "#ad775d", "#66796b", "#d6bea0", "#7b8d95", "#b89968", "#e8dfca"];
  for (let row = 0; row < 3; row++) {
    const bottom = 228 + row * 193;
    rect(1085, bottom, 397, 12, "#8f7c61");
    let x = 1105;
    for (let j = 0; j < 10; j++) {
      const h = 83 + ((j * 37 + row * 21) % 66),
        w = 20 + ((j * 7) % 17);
      rect(x, bottom - h, w, h, colors[(j + row * 2) % 8]!);
      line(x + 4, bottom - h + 12, x + w - 4, bottom - h + 12, "#fff5d555", 2);
      line(x + 4, bottom - 13, x + w - 4, bottom - 13, "#26372f33", 2);
      x += w + 5;
      if (x > 1450) break;
    }
  }
  // Mesa em perspectiva.
  c.fillStyle = "#b49875";
  c.beginPath();
  c.moveTo(0, 710);
  c.lineTo(1260, 615);
  c.lineTo(1600, 755);
  c.lineTo(1600, 1050);
  c.lineTo(0, 1050);
  c.fill();
  grad = c.createLinearGradient(0, 670, 0, 1050);
  grad.addColorStop(0, "#c3a681");
  grad.addColorStop(1, "#dfc8a3");
  c.fillStyle = grad;
  c.fillRect(0, 754, 1600, 296);
  for (let j = 0; j < 10; j++) line(0, 766 + j * 31, 1600, 681 + j * 42, "#846d4720", 2);
  // Notebook.
  ellipse(772, 777, 300, 30, "#615f4140");
  rect(490, 408, 576, 342, "#3f4940");
  rect(503, 422, 550, 306, "#f2f1e6");
  rect(503, 422, 550, 36, "#d9e1d0");
  ellipse(519, 440, 4, 4, "#9caa8e");
  ellipse(533, 440, 4, 4, "#ad997c");
  ellipse(547, 440, 4, 4, "#899b83");
  text("O mundo, em cada detalhe.", 536, 509, 29);
  text("UM NOVO PONTO DE VISTA", 537, 540, 11, "#77866a", "Arial");
  ["Luz natural. Novas perspectivas.", "Mais tempo para as boas histórias.", "Do trabalho aos pequenos momentos."].forEach((t, i) => text(t, 538, 580 + i * 27, 15, "#73776a", "Arial"));
  rect(905, 479, 110, 190, "#e0e3cf");
  ellipse(960, 533, 34, 34, "#b2c1a1");
  rect(928, 588, 63, 4, "#9aab8c");
  rect(928, 601, 63, 4, "#9aab8c");
  rect(938, 614, 43, 4, "#9aab8c");
  c.fillStyle = "#b0b7ac";
  c.beginPath();
  c.moveTo(490, 748);
  c.lineTo(1066, 748);
  c.lineTo(1130, 792);
  c.lineTo(427, 792);
  c.fill();
  for (let j = 0; j < 3; j++) for (let i = 0; i < 20; i++) rect(500 + i * 27 - j * 4, 755 + j * 8, 20, 4, "#7e887b");
  // Livro aberto na zona de perto.
  c.save();
  c.translate(800, 847);
  c.rotate(-0.025);
  c.shadowColor = "#55482750";
  c.shadowBlur = 25;
  c.shadowOffsetY = 12;
  rect(-292, -19, 584, 198, "#f6f0da");
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  rect(-1, -19, 2, 198, "#d9cba9");
  text("O prazer de enxergar", -266, 18, 22, "#5b614c");
  text("os pequenos detalhes.", 21, 18, 22, "#5b614c");
  const esq = ["Há beleza no que está perto.", "No que está longe também.", "Um livro, um novo caminho,", "um encontro ao fim da tarde."];
  const dir = ["Cada olhar conta uma história.", "Encontre a sua perspectiva.", "A luz convida a observar.", "O mundo segue em movimento."];
  for (let j = 0; j < 7; j++) {
    text(esq[j % 4]!, -266, 49 + j * 17, 12, "#7f806a", "Arial");
    text(dir[j % 4]!, 22, 49 + j * 17, 12, "#7f806a", "Arial");
  }
  c.restore();
  // Caneca e caneta.
  ellipse(1210, 850, 58, 19, "#67573633");
  c.strokeStyle = "#f0e5cc";
  c.lineWidth = 12;
  c.beginPath();
  c.arc(1250, 796, 22, -Math.PI / 2, Math.PI / 2);
  c.stroke();
  rect(1162, 775, 85, 66, "#dedcc2");
  ellipse(1204, 777, 42, 12, "#f3eacf");
  ellipse(1204, 777, 34, 8, "#6c5e48");
  ellipse(1204, 837, 42, 11, "#cfceb6");
  line(1100, 940, 1230, 916, "#59624c", 8);
  // Planta.
  rect(180, 660, 95, 126, "#b3ab8b");
  ellipse(228, 662, 47, 15, "#7a7c60");
  ellipse(228, 785, 47, 10, "#9e987a");
  for (let j = 0; j < 7; j++) {
    const x = 135 + ((j * 53) % 186),
      y = 458 + ((j * 49) % 168);
    line(228, 674, x, y, "#687951", 5);
    ellipse(x, y, 28, 68, j % 2 ? "#6e8459" : "#879568", ((j % 3) - 1) * 0.65);
  }
  grad = c.createLinearGradient(0, 950, 0, 1050);
  grad.addColorStop(0, "#594e3500");
  grad.addColorStop(1, "#594e3520");
  c.fillStyle = grad;
  c.fillRect(0, 950, 1600, 100);
  return canvas;
}
