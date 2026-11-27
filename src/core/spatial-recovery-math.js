// Fixed binary64 rotation kernels for local spatial recovery only.
// Adapted from the isolated W4 parity experiment; polynomial coefficients
// and argument reduction follow fdlibm.
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
// https://www.netlib.org/fdlibm/
//
// Do not change global Math or round stored geometry. Bounded recovery
// angles are deterministic; extreme preexisting authored orientations
// outside the tested reduction domain retain the legacy native behavior.
const sreMathBits=new DataView(new ArrayBuffer(8));
const sreMathWord=x=>{sreMathBits.setFloat64(0,x,false);return sreMathBits.getUint32(0,false)&0x7fffffff;};
const sreMathHighDouble=h=>{sreMathBits.setUint32(0,h,false);sreMathBits.setUint32(4,0,false);return sreMathBits.getFloat64(0,false);};
const sreMathNegative=x=>x<0||Object.is(x,-0);
// Fixed reduction of the small/medium sreMathAngle range using split pi/2.
const sreMathP1=1.57079632673412561417,sreMathP1t=6.07710050650619224932e-11;
const sreMathP2=6.07710050630396597660e-11,sreMathP2t=2.02226624879595063154e-21;
const sreMathP3=2.02226624871116645580e-21,sreMathP3t=8.47842766036889956997e-32;
function sreMathReduce(x){
  if(sreMathWord(x)<=0x3fe921fb)return [0,x,0];
  const a=Math.abs(x),n=Math.floor(a*0.636619772367581382433+0.5);
  let r=a-n*sreMathP1,w=n*sreMathP1t,y=r-w;
  const exponent=sreMathWord(a)>>>20;
  if(exponent-(sreMathWord(y)>>>20)>16){
    const t=r;w=n*sreMathP2;r=t-w;w=n*sreMathP2t-((t-r)-w);y=r-w;
    if(exponent-(sreMathWord(y)>>>20)>49){
      const t=r;w=n*sreMathP3;r=t-w;w=n*sreMathP3t-((t-r)-w);y=r-w;
    }
  }
  const tail=(r-y)-w;
  return sreMathNegative(x)?[-n,-y,-tail]:[n,y,tail];
}
function sreMathSinSmall(x,y,hasTail){
  if(Math.abs(x)<2**-27)return x;
  const z=x*x,v=z*x;
  const p=8.33333333332248946124e-3+z*(-1.98412698298579493134e-4+
    z*(2.75573137070700676789e-6+z*(-2.50507602534068634195e-8+z*1.58969099521155010221e-10)));
  const s=-1.66666666666666324348e-1;
  return hasTail?x-((z*(0.5*y-v*p)-y)-v*s):x+v*(s+z*p);
}
function sreMathCosSmall(x,y){
  if(Math.abs(x)<2**-27)return 1;
  const z=x*x,r=z*(4.16666666666666019037e-2+z*(-1.38888888888741095749e-3+
    z*(2.48015872894767294178e-5+z*(-2.75573143513906633035e-7+
    z*(2.08757232129817482790e-9+z*-1.13596475577881948265e-11)))));
  const hi=sreMathWord(x),correction=z*r-x*y;
  if(hi<0x3fd33333)return 1-(0.5*z-correction);
  const q=hi>0x3fe90000?0.28125:sreMathHighDouble(hi-0x00200000);
  return (1-q)-((0.5*z-q)-correction);
}
function sreMathTrig(x,cos){
  const [n,a,b]=sreMathReduce(x),q=(n+(cos?1:0))&3;
  if(q===0)return sreMathSinSmall(a,b,n!==0);
  if(q===1)return sreMathCosSmall(a,b);
  if(q===2)return -sreMathSinSmall(a,b,n!==0);
  return -sreMathCosSmall(a,b);
}
const sreMathAtanHi=[4.63647609000806093515e-1,7.85398163397448278999e-1,9.82793723247329054082e-1,1.57079632679489655800];
const sreMathAtanLo=[2.26987774529616870924e-17,3.06161699786838301793e-17,1.39033110312309984516e-17,6.12323399573676603587e-17];
const sreMathAtanCoeffs=[3.33333333333329318027e-1,-1.99999999998764832476e-1,1.42857142725034663711e-1,
  -1.11111104054623557880e-1,9.09088713343650656196e-2,-7.69187620504482999495e-2,
  6.66107313738753120669e-2,-5.83357013379057348645e-2,4.97687799461593236017e-2,
  -3.65315727442169155270e-2,1.62858201153657823623e-2];
function sreMathAtanPositive(x){
  if(x<2**-27)return x;
  if(x>=2**66)return sreMathAtanHi[3]+sreMathAtanLo[3];
  let id=-1;
  if(x>=0.4375){
    if(x<0.6875){id=0;x=(2*x-1)/(2+x);}
    else if(x<1.1875){id=1;x=(x-1)/(x+1);}
    else if(x<2.4375){id=2;x=(x-1.5)/(1+1.5*x);}
    else{id=3;x=-1/x;}
  }
  const z=x*x,w=z*z;
  const s=z*(sreMathAtanCoeffs[0]+w*(sreMathAtanCoeffs[2]+w*(sreMathAtanCoeffs[4]+w*(sreMathAtanCoeffs[6]+w*(sreMathAtanCoeffs[8]+w*sreMathAtanCoeffs[10])))))+
    w*(sreMathAtanCoeffs[1]+w*(sreMathAtanCoeffs[3]+w*(sreMathAtanCoeffs[5]+w*(sreMathAtanCoeffs[7]+w*sreMathAtanCoeffs[9]))));
  return id<0?x-x*s:sreMathAtanHi[id]-((x*s-sreMathAtanLo[id])-x);
}
export function sreMathAtan2(y,x){
  if(!Number.isFinite(x)||!Number.isFinite(y))return Math.atan2(y,x);
  const negY=sreMathNegative(y),negX=sreMathNegative(x),sgn=negY?-1:1;
  if(y===0)return negX?sgn*Math.PI:y;
  if(x===0)return sgn*Math.PI/2;
  const k=(sreMathWord(y)-sreMathWord(x))>>20;
  if(k>60)return sgn*(Math.PI/2+0.5*1.2246467991473531772e-16);
  const z=negX&&k< -60?0:sreMathAtanPositive(Math.abs(y/x));
  return negX?sgn*(Math.PI-(z-1.2246467991473531772e-16)):sgn*z;
}

export function sreMathSin(x){
  return Number.isFinite(x)&&Math.abs(x)<=1024?sreMathTrig(x,false):Math.sin(x);
}
export function sreMathCos(x){
  return Number.isFinite(x)&&Math.abs(x)<=1024?sreMathTrig(x,true):Math.cos(x);
}
