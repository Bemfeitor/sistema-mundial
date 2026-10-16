// Campos monoculares ilustrativos. Nenhuma geometria medida de fabricante é usada.
// Porte de optics.js do simulador "Experiência Multifocal".

export interface PerfilLente {
  name: string;
  far: number;
  corridor: number;
  near: number;
  edge: number;
  warp: number;
}

export const profiles: PerfilLente[] = [
  { name: "Tradicional", far: 0.435, corridor: 0.066, near: 0.155, edge: 0.15, warp: 1 },
  { name: "Digital", far: 0.445, corridor: 0.112, near: 0.218, edge: 0.17, warp: 0.86 },
  { name: "Personalizada", far: 0.455, corridor: 0.165, near: 0.282, edge: 0.19, warp: 0.74 },
  { name: "Ocupacional", far: 0.16, corridor: 0.22, near: 0.3, edge: 0.14, warp: 0.68 },
];

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function fieldAt(x: number, y: number, lens: number, corridor: number, addition = 2) {
  const p = profiles[lens]!,
    occupational = lens === 3,
    end = 0.7 + 0.09 * corridor;
  const progression = smooth(occupational ? 0.2 : 0.28, end, y),
    center = 0.5 - 0.045 * progression;
  const factor = clamp(Math.sqrt(2 / addition), 0.72, 1.5);
  const upper = mix(occupational ? p.corridor : p.far, p.corridor * factor, smooth(0.02, 0.5, progression));
  const width = mix(upper, p.near * factor, smooth(0.7, 1, progression));
  const peripheral = smooth(width, width + p.edge, Math.abs(x - center));
  const zone = occupational ? (progression < 0.7 ? "intermediário" : "perto") : progression < 0.15 ? "longe" : progression < 0.85 ? "intermediário" : "perto";
  return { width, center, peripheral, progression, zone };
}

export const vertexShader = `attribute vec2 a_position;varying vec2 uv;void main(){uv=vec2(a_position.x*.5+.5,.5-a_position.y*.5);gl_Position=vec4(a_position,0.,1.);}`;
const vec = (p: PerfilLente) => `vec4(${[p.far, p.corridor, p.near, p.edge].map((n) => n.toFixed(5)).join(",")})`;
const [p0, p1, p2, p3] = profiles as [PerfilLente, PerfilLente, PerfilLente, PerfilLente];

export const fragmentShader = `precision mediump float;
 varying vec2 uv;
 uniform sampler2D u_image,u_soft,u_blurred;
 uniform vec2 u_resolution;
 uniform vec3 u_tint;
 uniform float u_sourceRatio,u_lens,u_other,u_panes,u_corridor,u_intensity,u_map,u_original,u_distance,u_didactic,u_photo,u_darkness,u_photoBase,u_gradient,u_addition,u_brightness;
 vec4 profile(float c){return c<1.?mix(${vec(p0)},${vec(p1)},clamp(c,0.,1.)):c<2.?mix(${vec(p1)},${vec(p2)},clamp(c-1.,0.,1.)):mix(${vec(p2)},${vec(p3)},clamp(c-2.,0.,1.));}
 void main(){
  vec2 p=uv;float lens=u_lens;
  if(u_panes>1.5){float pane=min(floor(uv.x*u_panes),u_panes-1.);p.x=fract(uv.x*u_panes);lens=u_panes>2.5?pane:(pane<.5?u_lens:u_other);}
  vec4 pr=profile(lens);float endpoint=.70+.09*u_corridor;float occupational=lens>2.5?1.:0.;
  float progression=smoothstep(mix(.28,.20,occupational),endpoint,p.y);
  float center=.5-.045*progression;
  float factor=clamp(sqrt(2./u_addition),.72,1.5);
  float width=mix(mix(mix(pr.x,pr.y,occupational),pr.y*factor,smoothstep(.02,.5,progression)),pr.z*factor,smoothstep(.70,1.,progression));
  float dx=p.x-center;float peripheral=smoothstep(width,width+pr.w,abs(dx));
  float mismatch=u_distance<0.?0.:occupational>.5&&u_distance<.1?1.:smoothstep(.12,.8,abs(progression-u_distance));
  float strength=u_intensity*(1.-u_original);
  float warpScale=mix(mix(mix(1.,.86,clamp(lens,0.,1.)),.74,clamp(lens-1.,0.,1.)),.68,clamp(lens-2.,0.,1.));
  float start=mix(.28,.20,occupational),t=clamp((p.y-start)/(endpoint-start),0.,1.);
  float slope=6.*t*(1.-t)/(endpoint-start);
  float gradientFactor=(.68+.24*slope)*u_addition/2.;
  vec2 distorted=p;
  distorted.x+=min(strength,1.5)*warpScale*peripheral*dx*.09*gradientFactor;
  distorted.y+=min(strength,1.5)*warpScale*peripheral*dx*abs(dx)*.17*(p.y-.20)*gradientFactor;
  float aspect=u_resolution.x/u_resolution.y/u_panes;
  vec2 crop=vec2(min(1.,aspect/u_sourceRatio),min(1.,u_sourceRatio/aspect));
  vec2 coord=clamp((distorted-.5)*crop+.5,vec2(.002),vec2(.998));
  float blur=strength*(peripheral*gradientFactor+mismatch*.85)*(1.+u_didactic*.85);
  vec3 sharp=texture2D(u_image,coord).rgb;
  vec3 soft=texture2D(u_soft,coord).rgb;
  vec3 heavy=texture2D(u_blurred,coord).rgb;
  vec3 col=mix(sharp,soft,smoothstep(0.,.50,blur));
  col=mix(col,heavy,smoothstep(.35,1.85,blur));
  col=pow(clamp(col,0.,1.),vec3(1./max(1.,u_brightness)));
  float residual=mix(u_photoBase,u_photoBase*(1.7-1.5*p.y),u_gradient);
  float density=mix(residual,.76,u_darkness)*u_photo*(1.-u_original);
  vec3 transmission=mix(vec3(1.),vec3(.48)+u_tint*.52,density);
  col*=transmission*(1.-density*.79);
  float map=u_map*(1.-u_original);
  vec3 zoneColor=mix(vec3(.22,.64,.42),vec3(.59,.30,.67),peripheral);
  col=mix(col,zoneColor,map*mix(.21,.48,peripheral));
  float border=1.-smoothstep(.001,.009,abs(abs(dx)-width));
  col=mix(col,vec3(.86,1.,.56),map*border*.88);
  gl_FragColor=vec4(col,1.);
 }`;

export const blurVertex = `attribute vec2 a_position;varying vec2 uv;void main(){uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
export const blurFragment = `precision mediump float;varying vec2 uv;uniform sampler2D u_input;uniform vec2 u_step;
 void main(){vec3 c=texture2D(u_input,uv).rgb*.227027;
 c+=(texture2D(u_input,uv+u_step).rgb+texture2D(u_input,uv-u_step).rgb)*.1945946;
 c+=(texture2D(u_input,uv+u_step*2.).rgb+texture2D(u_input,uv-u_step*2.).rgb)*.1216216;
 c+=(texture2D(u_input,uv+u_step*3.).rgb+texture2D(u_input,uv-u_step*3.).rgb)*.054054;
 c+=(texture2D(u_input,uv+u_step*4.).rgb+texture2D(u_input,uv-u_step*4.).rgb)*.016216;
 gl_FragColor=vec4(c,1.);}`;
