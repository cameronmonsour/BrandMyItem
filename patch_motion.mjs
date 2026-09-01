import fs from 'fs';
let html = fs.readFileSync('artifacts/brandmyitem/index.html', 'utf8');

const motionCSS = `
/* Micro-interactions & Reduced Motion */
.ap-card {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .ap-card:not(.ap-card-primary):hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02);
  }
}
.ap-stage-box .item3d {
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.ap-stage-box:hover .item3d {
  transform: rotateX(8deg) rotateY(-16deg) scale(0.92) !important;
}

@media (prefers-reduced-motion: reduce) {
  .ap-card { transition: none; transform: none !important; box-shadow: 0 4px 24px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.02) !important; }
  .ap-stage-box .item3d { transition: none !important; transform: rotateX(10deg) rotateY(-20deg) scale(0.9) !important; }
  .ap-bar-fill { transition: none; }
}
`;
html = html.replace('</style>', motionCSS + '\n</style>');
fs.writeFileSync('artifacts/brandmyitem/index.html', html);
