
// frame  - CDC frame to add to this Animation
// key    - cQueDirective ID key
// fIndex - (subframe) the index of this animation frame /the whole anim 
// xO - xoffset in reference to world
// yO - yoffset in reference to world
// sfd - subframe duration
// xAOff - armor x offset for this frame
// yAOff - armor y offset for this frame
#define STANDSFD 4
Animation *AddFrame(CDC *frame, I64 key, I8 fIndex; 
                    I8 xO=0, I8 yO=0, I64 sfd=STANDSFD,
                    I64 xAOff=0, I64 yAOff=0){
 Animation *createdFrame = CAlloc(sizeof(Animation));
 createdFrame->frame = frame;
 createdFrame->frameDuration = sfd;
 createdFrame->frameDurationIndex = 0;
 createdFrame->frameIndex = fIndex;
 createdFrame->xOffset=xO;
 createdFrame->yOffset=yO;
 createdFrame->xAOff=xAOff;
 createdFrame->yAOff=yAOff;
 createdFrame->key = key;  
 return createdFrame;
}



Animation *CreateAnimation(I64 wadFrameName){
 switch(wadFrameName) {
  case T1FISH:
   QueIns(AddFrame(AAE110,T1FISH,0,5,2,24),allAnimations.last);  
   QueIns(AddFrame(AAE111,T1FISH,1,5,2,24),allAnimations.last);
  break;
  case T2FISH:
   QueIns(AddFrame(AAE164,T2FISH,0,5,2,24),allAnimations.last);   
   QueIns(AddFrame(AAE165,T2FISH,1,5,2,24),allAnimations.last);
  break;
  case T3FISH:
   QueIns(AddFrame(AAE2,T3FISH,0,5,2,24),allAnimations.last);  
   QueIns(AddFrame(AAE3,T3FISH,1,5,2,24),allAnimations.last);
  break;
  case T4FISH:
   QueIns(AddFrame(AAE56,T4FISH,0,5,2,24),allAnimations.last); 
   QueIns(AddFrame(AAE57,T4FISH,1,5,2,24),allAnimations.last);
  break;
  case T1READY:
   QueIns(AddFrame(AAE60,T1READY,0,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE61,T1READY,1,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE62,T1READY,2,0,0,24),allAnimations.last);    
  break;
  case T2READY:
   QueIns(AddFrame(AAE115,T2READY,0,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE116,T2READY,1,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE117,T2READY,2,0,0,24),allAnimations.last);    
  break;
  case T3READY:
   QueIns(AddFrame(AAE169,T3READY,0,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE170,T3READY,1,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE171,T3READY,2,0,0,24),allAnimations.last);    
  break;
  case T4READY:
   QueIns(AddFrame(AAE7,T4READY,0,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE8,T4READY,1,0,0,24),allAnimations.last);
   QueIns(AddFrame(AAE9,T4READY,2,0,0,24),allAnimations.last);    
  break;
  case T1PUNCH:
   QueIns(AddFrame(AAE61,T1PUNCH,0,0,0,STANDSFD,6),allAnimations.last);
   QueIns(AddFrame(AAE62,T1PUNCH,1,0,0,STANDSFD,5),allAnimations.last);
   QueIns(AddFrame(AAE63,T1PUNCH,2,0,0,STANDSFD,4),allAnimations.last);    
   QueIns(AddFrame(AAE64,T1PUNCH,3,0,0,STANDSFD,3),allAnimations.last);
   QueIns(AddFrame(AAE65,T1PUNCH,4,0,0,STANDSFD,2),allAnimations.last);
   QueIns(AddFrame(AAE66,T1PUNCH,5,0,0,STANDSFD,1),allAnimations.last);    
   QueIns(AddFrame(AAE67,T1PUNCH,6,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE68,T1PUNCH,7,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE69,T1PUNCH,8,0,0,STANDSFD,-4),allAnimations.last);    
   QueIns(AddFrame(AAE70,T1PUNCH,9,0,0,STANDSFD,1),allAnimations.last);
   QueIns(AddFrame(AAE71,T1PUNCH,10,0,0,STANDSFD,0),allAnimations.last);
   QueIns(AddFrame(AAE72,T1PUNCH,11,0,0,STANDSFD,0),allAnimations.last);    
  break;
  case T2PUNCH:
   QueIns(AddFrame(AAE115,T2PUNCH,0,0,0,STANDSFD,6),allAnimations.last);
   QueIns(AddFrame(AAE116,T2PUNCH,1,0,0,STANDSFD,5),allAnimations.last);
   QueIns(AddFrame(AAE117,T2PUNCH,2,0,0,STANDSFD,4),allAnimations.last);    
   QueIns(AddFrame(AAE118,T2PUNCH,3,0,0,STANDSFD,3),allAnimations.last);
   QueIns(AddFrame(AAE119,T2PUNCH,4,0,0,STANDSFD,2),allAnimations.last);
   QueIns(AddFrame(AAE120,T2PUNCH,5,0,0,STANDSFD,1),allAnimations.last);    
   QueIns(AddFrame(AAE121,T2PUNCH,6,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE122,T2PUNCH,7,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE123,T2PUNCH,8,0,0,STANDSFD,-4),allAnimations.last);    
   QueIns(AddFrame(AAE124,T2PUNCH,9,0,0,STANDSFD,1),allAnimations.last);
   QueIns(AddFrame(AAE125,T2PUNCH,10,0,0,STANDSFD,0),allAnimations.last);
   QueIns(AddFrame(AAE126,T2PUNCH,11,0,0,STANDSFD,0),allAnimations.last);
  break;
  case T3PUNCH:
   QueIns(AddFrame(AAE169,T3PUNCH,0,0,0,STANDSFD,6),allAnimations.last);
   QueIns(AddFrame(AAE170,T3PUNCH,1,0,0,STANDSFD,5),allAnimations.last);
   QueIns(AddFrame(AAE171,T3PUNCH,2,0,0,STANDSFD,4),allAnimations.last);    
   QueIns(AddFrame(AAE172,T3PUNCH,3,0,0,STANDSFD,3),allAnimations.last);
   QueIns(AddFrame(AAE173,T3PUNCH,4,0,0,STANDSFD,2),allAnimations.last);
   QueIns(AddFrame(AAE174,T3PUNCH,5,0,0,STANDSFD,1),allAnimations.last);    
   QueIns(AddFrame(AAE175,T3PUNCH,6,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE176,T3PUNCH,7,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE177,T3PUNCH,8,0,0,STANDSFD,-4),allAnimations.last);    
   QueIns(AddFrame(AAE178,T3PUNCH,9,0,0,STANDSFD,1),allAnimations.last);
   QueIns(AddFrame(AAE179,T3PUNCH,10,0,0,STANDSFD,0),allAnimations.last);
   QueIns(AddFrame(AAE180,T3PUNCH,11,0,0,STANDSFD,0),allAnimations.last);
  break;
  case T4PUNCH:
   QueIns(AddFrame(AAE7,T4PUNCH,0,0,0,STANDSFD,6),allAnimations.last);
   QueIns(AddFrame(AAE8,T4PUNCH,1,0,0,STANDSFD,5),allAnimations.last);
   QueIns(AddFrame(AAE9,T4PUNCH,2,0,0,STANDSFD,4),allAnimations.last);    
   QueIns(AddFrame(AAE10,T4PUNCH,3,0,0,STANDSFD,3),allAnimations.last);
   QueIns(AddFrame(AAE11,T4PUNCH,4,0,0,STANDSFD,2),allAnimations.last);
   QueIns(AddFrame(AAE12,T4PUNCH,5,0,0,STANDSFD,1),allAnimations.last);    
   QueIns(AddFrame(AAE13,T4PUNCH,6,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE14,T4PUNCH,7,0,0,STANDSFD,-4),allAnimations.last);
   QueIns(AddFrame(AAE15,T4PUNCH,8,0,0,STANDSFD,-4),allAnimations.last);    
   QueIns(AddFrame(AAE16,T4PUNCH,9,0,0,STANDSFD,1),allAnimations.last);
   QueIns(AddFrame(AAE17,T4PUNCH,10,0,0,STANDSFD,0),allAnimations.last);
   QueIns(AddFrame(AAE18,T4PUNCH,11,0,0,STANDSFD,0),allAnimations.last);     
  break;
  case T1STAB:
   QueIns(AddFrame(AAE72,T1STAB,0),allAnimations.last);
   QueIns(AddFrame(AAE69,T1STAB,1),allAnimations.last);
   QueIns(AddFrame(AAE66,T1STAB,2),allAnimations.last);
   QueIns(AddFrame(AAE65,T1STAB,3),allAnimations.last);
   QueIns(AddFrame(AAE63,T1STAB,4),allAnimations.last);
  break;
  case T2STAB:
   QueIns(AddFrame(AAE115,T2STAB,0),allAnimations.last);
   QueIns(AddFrame(AAE122,T2STAB,1),allAnimations.last);
   QueIns(AddFrame(AAE120,T2STAB,2),allAnimations.last);
   QueIns(AddFrame(AAE119,T2STAB,3),allAnimations.last);
   QueIns(AddFrame(AAE118,T2STAB,4),allAnimations.last);
  break;
  case T3STAB:
   QueIns(AddFrame(AAE169,T3STAB,0),allAnimations.last);
   QueIns(AddFrame(AAE176,T3STAB,1),allAnimations.last);
   QueIns(AddFrame(AAE174,T3STAB,2),allAnimations.last);
   QueIns(AddFrame(AAE173,T3STAB,3),allAnimations.last);
   QueIns(AddFrame(AAE172,T3STAB,4),allAnimations.last);
  break;
  case T4STAB:
   QueIns(AddFrame(AAE9, T4STAB,0),allAnimations.last);
   QueIns(AddFrame(AAE14,T4STAB,1),allAnimations.last);
   QueIns(AddFrame(AAE12,T4STAB,2),allAnimations.last);
   QueIns(AddFrame(AAE11,T4STAB,3),allAnimations.last);
   QueIns(AddFrame(AAE10,T4STAB,4),allAnimations.last);
  break;
  case T1SLASH:
   QueIns(AddFrame(AAE62,T1SLASH,0),allAnimations.last);
   QueIns(AddFrame(AAE66,T1SLASH,1),allAnimations.last);
   QueIns(AddFrame(AAE73,T1SLASH,2),allAnimations.last);
   QueIns(AddFrame(AAE66,T1SLASH,3),allAnimations.last);
   QueIns(AddFrame(AAE62,T1SLASH,4),allAnimations.last);
  break;
  case T2SLASH:
   QueIns(AddFrame(AAE116,T2SLASH,0),allAnimations.last);
   QueIns(AddFrame(AAE120,T2SLASH,1),allAnimations.last);
   QueIns(AddFrame(AAE127,T2SLASH,2),allAnimations.last);
   QueIns(AddFrame(AAE120,T2SLASH,3),allAnimations.last);
   QueIns(AddFrame(AAE116,T2SLASH,4),allAnimations.last);
  break;
  case T3SLASH:
   QueIns(AddFrame(AAE170,T3SLASH,0),allAnimations.last);
   QueIns(AddFrame(AAE174,T3SLASH,1),allAnimations.last);
   QueIns(AddFrame(AAE181,T3SLASH,2),allAnimations.last);
   QueIns(AddFrame(AAE174,T3SLASH,3),allAnimations.last);
   QueIns(AddFrame(AAE170,T3SLASH,4),allAnimations.last);
  break;
  case T4SLASH:
   QueIns(AddFrame(AAE16,T4SLASH,0),allAnimations.last);
   QueIns(AddFrame(AAE12,T4SLASH,1),allAnimations.last);
   QueIns(AddFrame(AAE19,T4SLASH,2),allAnimations.last);
   QueIns(AddFrame(AAE12,T4SLASH,3),allAnimations.last);
   QueIns(AddFrame(AAE16,T4SLASH,4),allAnimations.last);
  break;
  case BOUNCE:
   QueIns(AddFrame(AAE7,BOUNCE,0),allAnimations.last);
  break;
  case ARCSTRIKE:
   QueIns(AddFrame(AAE7,ARCSTRIKE,0),allAnimations.last);
  break;
  case T1HURT:
   QueIns(AddFrame(AAE97,T1HURT,0),allAnimations.last);
   QueIns(AddFrame(AAE98,T1HURT,1),allAnimations.last);
   QueIns(AddFrame(AAE99,T1HURT,2),allAnimations.last);
  break;
  case T2HURT:
   QueIns(AddFrame(AAE151,T2HURT,0),allAnimations.last);
   QueIns(AddFrame(AAE152,T2HURT,1),allAnimations.last);
   QueIns(AddFrame(AAE153,T2HURT,2),allAnimations.last);
  break;
  case T3HURT:
   QueIns(AddFrame(AAE205,T3HURT,0),allAnimations.last);
   QueIns(AddFrame(AAE206,T3HURT,1),allAnimations.last);
   QueIns(AddFrame(AAE207,T3HURT,2),allAnimations.last);
  break;
  case T4HURT:
   QueIns(AddFrame(AAE52,T4HURT,0),allAnimations.last);
   QueIns(AddFrame(AAE53,T4HURT,1),allAnimations.last);
   QueIns(AddFrame(AAE54,T4HURT,2),allAnimations.last);
  break;
  case T1DIE:
   QueIns(AddFrame(AAE74,T1DIE,0),allAnimations.last);
   QueIns(AddFrame(AAE75,T1DIE,1),allAnimations.last);
   QueIns(AddFrame(AAE85,T1DIE,2),allAnimations.last);
   QueIns(AddFrame(AAE86,T1DIE,3),allAnimations.last);
   QueIns(AddFrame(AAE87,T1DIE,4),allAnimations.last);
   QueIns(AddFrame(AAE112,T1DIE,5),allAnimations.last);
   QueIns(AddFrame(AAE113,T1DIE,6),allAnimations.last);
   QueIns(AddFrame(AAE114,T1DIE,7),allAnimations.last);
  break;
  case T2DIE:
   QueIns(AddFrame(AAE115,T2DIE,0),allAnimations.last);
   QueIns(AddFrame(AAE121,T2DIE,1),allAnimations.last);
   QueIns(AddFrame(AAE146,T2DIE,2),allAnimations.last);
   QueIns(AddFrame(AAE148,T2DIE,3),allAnimations.last);
   QueIns(AddFrame(AAE149,T2DIE,4),allAnimations.last);
   QueIns(AddFrame(AAE158,T2DIE,5),allAnimations.last);
   QueIns(AddFrame(AAE166,T2DIE,6),allAnimations.last);
   QueIns(AddFrame(AAE167,T2DIE,7),allAnimations.last);
  break;
  case T3DIE:
   QueIns(AddFrame(AAE181,T3DIE,0),allAnimations.last);
   QueIns(AddFrame(AAE182,T3DIE,1),allAnimations.last);
   QueIns(AddFrame(AAE184,T3DIE,2),allAnimations.last);
   QueIns(AddFrame(AAE189,T3DIE,3),allAnimations.last);
   QueIns(AddFrame(AAE194,T3DIE,4),allAnimations.last);
   QueIns(AddFrame(AAE204,T3DIE,5),allAnimations.last);
   QueIns(AddFrame(AAE4,T3DIE,6),allAnimations.last);
   QueIns(AddFrame(AAE6,T3DIE,7),allAnimations.last);
  break;
  case T4DIE:
   QueIns(AddFrame(AAE29,T4DIE,0),allAnimations.last);
   QueIns(AddFrame(AAE30,T4DIE,1),allAnimations.last);
   QueIns(AddFrame(AAE31,T4DIE,2),allAnimations.last);
   QueIns(AddFrame(AAE32,T4DIE,3),allAnimations.last);
   QueIns(AddFrame(AAE33,T4DIE,4),allAnimations.last);
   QueIns(AddFrame(AAE58,T4DIE,5),allAnimations.last);
   QueIns(AddFrame(AAE59,T4DIE,6),allAnimations.last);
   QueIns(AddFrame(AAE60,T4DIE,7),allAnimations.last);
  break;
  case T1CAST:
   QueIns(AddFrame(AAE75,T1CAST,0),allAnimations.last);
   QueIns(AddFrame(AAE76,T1CAST,1),allAnimations.last);
   QueIns(AddFrame(AAE80,T1CAST,2),allAnimations.last);
   QueIns(AddFrame(AAE77,T1CAST,3),allAnimations.last);
   QueIns(AddFrame(AAE78,T1CAST,4),allAnimations.last);
   QueIns(AddFrame(AAE78,T1CAST,5),allAnimations.last);
   QueIns(AddFrame(AAE78,T1CAST,6),allAnimations.last);
  break;
  case T2CAST:
   QueIns(AddFrame(AAE128,T2CAST,0),allAnimations.last);
   QueIns(AddFrame(AAE129,T2CAST,1),allAnimations.last);
   QueIns(AddFrame(AAE133,T2CAST,2),allAnimations.last);
   QueIns(AddFrame(AAE130,T2CAST,3),allAnimations.last);
   QueIns(AddFrame(AAE131,T2CAST,4),allAnimations.last);
   QueIns(AddFrame(AAE132,T2CAST,5),allAnimations.last);
   QueIns(AddFrame(AAE132,T2CAST,6),allAnimations.last);
  break;
  case T3CAST:
   QueIns(AddFrame(AAE210,T3CAST,0),allAnimations.last);
   QueIns(AddFrame(AAE183,T3CAST,1),allAnimations.last);
   QueIns(AddFrame(AAE187,T3CAST,2),allAnimations.last);
   QueIns(AddFrame(AAE185,T3CAST,3),allAnimations.last);
   QueIns(AddFrame(AAE186,T3CAST,4),allAnimations.last);
   QueIns(AddFrame(AAE186,T3CAST,5),allAnimations.last);
   QueIns(AddFrame(AAE186,T3CAST,6),allAnimations.last);
  break;
  case T4CAST:
   QueIns(AddFrame(AAE20,T4CAST,0),allAnimations.last);
   QueIns(AddFrame(AAE21,T4CAST,1),allAnimations.last);
   QueIns(AddFrame(AAE25,T4CAST,2),allAnimations.last);
   QueIns(AddFrame(AAE22,T4CAST,3),allAnimations.last);
   QueIns(AddFrame(AAE23,T4CAST,4),allAnimations.last);
   QueIns(AddFrame(AAE24,T4CAST,5),allAnimations.last);
   QueIns(AddFrame(AAE24,T4CAST,6),allAnimations.last);
  break;
  case T1EFFHEAL:
   QueIns(AddFrame(EFF075,T1EFFHEAL,0),allAnimations.last);
   QueIns(AddFrame(EFF076,T1EFFHEAL,1),allAnimations.last);
   QueIns(AddFrame(EFF036,T1EFFHEAL,2),allAnimations.last);
   QueIns(AddFrame(EFF037,T1EFFHEAL,3),allAnimations.last);
   QueIns(AddFrame(EFF034,T1EFFHEAL,4),allAnimations.last);
   QueIns(AddFrame(EFF033,T1EFFHEAL,5),allAnimations.last);
   QueIns(AddFrame(EFF031,T1EFFHEAL,6),allAnimations.last);
  break;
  case EFFFISH:
   QueIns(AddFrame(EFF121,EFFFISH,0),allAnimations.last);
   QueIns(AddFrame(EFF122,EFFFISH,1),allAnimations.last);
   QueIns(AddFrame(EFF123,EFFFISH,2),allAnimations.last);
   QueIns(AddFrame(EFF169,EFFFISH,3),allAnimations.last);
   QueIns(AddFrame(EFF170,EFFFISH,4),allAnimations.last);
   QueIns(AddFrame(EFF171,EFFFISH,5),allAnimations.last);
   QueIns(AddFrame(EFF172,EFFFISH,6),allAnimations.last);
   QueIns(AddFrame(EFF173,EFFFISH,7),allAnimations.last);
   QueIns(AddFrame(EFF174,EFFFISH,8),allAnimations.last);
  break;
  case EFFFIRE:
   QueIns(AddFrame(EFF288,EFFFIRE,0),allAnimations.last);
   QueIns(AddFrame(EFF289,EFFFIRE,1),allAnimations.last);
   QueIns(AddFrame(EFF321,EFFFIRE,2),allAnimations.last);
   QueIns(AddFrame(EFF322,EFFFIRE,3),allAnimations.last);
   QueIns(AddFrame(EFF323,EFFFIRE,4),allAnimations.last);
   QueIns(AddFrame(EFF324,EFFFIRE,5),allAnimations.last);
   QueIns(AddFrame(EFF360,EFFFIRE,6),allAnimations.last);
   QueIns(AddFrame(EFF361,EFFFIRE,7),allAnimations.last);
   QueIns(AddFrame(EFF362,EFFFIRE,8),allAnimations.last);
   QueIns(AddFrame(EFF363,EFFFIRE,9),allAnimations.last);
   QueIns(AddFrame(EFF364,EFFFIRE,10),allAnimations.last);
  break;
  case EFFCLICK:
   QueIns(AddFrame(EFF150,EFFCLICK,0,-40,-48,2),allAnimations.last);
   QueIns(AddFrame(EFF151,EFFCLICK,1,-40,-48,2),allAnimations.last);
   QueIns(AddFrame(EFF152,EFFCLICK,2,-40,-48,2),allAnimations.last);
   QueIns(AddFrame(EFF153,EFFCLICK,3,-40,-48,2),allAnimations.last);
   QueIns(AddFrame(EFF154,EFFCLICK,4,-40,-48,2),allAnimations.last);
   QueIns(AddFrame(EFF154A,EFFCLICK,5,-40,-48,2),allAnimations.last);
  break;
  case EFFSCRATCH:
   QueIns(AddFrame(EFF025,EFFSCRATCH,0),allAnimations.last);
   QueIns(AddFrame(EFF060,EFFSCRATCH,1),allAnimations.last);
   QueIns(AddFrame(EFF026,EFFSCRATCH,2),allAnimations.last);
   QueIns(AddFrame(EFF061,EFFSCRATCH,3),allAnimations.last);
   QueIns(AddFrame(EFF026,EFFSCRATCH,4),allAnimations.last);
   QueIns(AddFrame(EFF060,EFFSCRATCH,5),allAnimations.last);
   QueIns(AddFrame(EFF025,EFFSCRATCH,6),allAnimations.last);
  break;
  case EFFBANNER:
   QueIns(AddFrame(EFF420,EFFBANNER,0),allAnimations.last);
   QueIns(AddFrame(EFF421,EFFBANNER,1),allAnimations.last);
   QueIns(AddFrame(EFF421,EFFBANNER,2),allAnimations.last);
   QueIns(AddFrame(EFF421,EFFBANNER,3),allAnimations.last);
   QueIns(AddFrame(EFF422,EFFBANNER,4),allAnimations.last);
   QueIns(AddFrame(EFF421,EFFBANNER,5),allAnimations.last);
   QueIns(AddFrame(EFF421,EFFBANNER,6),allAnimations.last);
   QueIns(AddFrame(EFF421,EFFBANNER,7),allAnimations.last);
  break;
  case T1SLEEP:
   QueIns(AddFrame(AAE87,T1SLEEP,0,0,0,600,6,12),allAnimations.last);
  break;
  case T2SLEEP:
   QueIns(AddFrame(AAE139,T2SLEEP,0,0,0,600,6,12),allAnimations.last);
  break;
  case T3SLEEP:
   QueIns(AddFrame(AAE194,T3SLEEP,0,0,0,600,6,12),allAnimations.last);
  break;
  case T4SLEEP:
   QueIns(AddFrame(AAE51,T4SLEEP,0,0,0,600,6,12),allAnimations.last);
  break;
  case EFFSLEEP:
   QueIns(AddFrame(EFF231,EFFSLEEP,0,0,0,600,0,12),allAnimations.last);
  break; 
 }
}

U0 ProceduralAnimate1(CDC *dc,Director *task){
 task->a->visible =TRUE;  
 // Animate: back and forth horizontally and sinusoidal bounce vertically
 task->z++;
 F64 time = task->z / 10.0; // adjust speed
 F64 amplitudeX = 10;       // horizontal distance
 F64 amplitudeY = 4;       // vertical arc height
 task->a->screenX = task->x + (amplitudeX * Sin(time));
 task->a->screenY = task->y - (amplitudeY * Abs(Sin(time))); // bounce upward only
 if (time > 2 * pi) {
  task->z = 0;
 }
}

F64 fmod(F64 x, F64 y){
    F64 div = x / y;
    I64 n = ToI64(div);  // truncate toward zero
    return x - ToF64(n * y);
}

U0 ProceduralAnimateArc(CDC *dc, Director *task){
 task->a->visible = TRUE;  
 task->z++;
 Actor *player = GetPlayer; 
 // Timing
 F64 duration = 32.0;  // one full travel forward or backward
 F64 cycle = fmod(task->z / duration, 2.0); 
 F64 t;
 if (cycle <= 1.0)
  t = cycle;// going forward 
 else {
  if(!HasDirective(EFFSCRATCH,player)){
   AddDirective(EFFSCRATCH,player,player->screenX,player->screenY+10);
   switch(player->face){
    case T_JUDA:
     AddDirective(T1HURT,player);  
    break;
    case T_LEVI:
     AddDirective(T2HURT,player);
    break;
    case T_EPHR:
     AddDirective(T3HURT,player);
    break;
    case T_BENJ:
     AddDirective(T4HURT,player);
    break;
   }
  }
  t = 2.0 - cycle;// coming back
 }
 F64 phase = task->z / 10.0; // for bounce timing
   
 // Start and end points
 F64 sx = task->x;
 F64 sy = task->y;
 F64 ex = player->screenX;
 F64 ey = player->screenY;
   
 // LERP between start and end
 F64 px = sx + (ex - sx) * t;
 F64 py = sy + (ey - sy) * t;
   
 // Bounce
 F64 amplitudeY = 15.0;
 F64 bounce = amplitudeY * Abs(Sin(phase));

 // Apply
 task->a->screenX = px;
 task->a->screenY = py - bounce;
}

Bool ProceduralInit(CDC *dc, Director *task){
 switch(task->cQueDirective){
  case BOUNCE:
   ProceduralAnimate1(dc,task);
   return TRUE;  
  case ARCSTRIKE:
   ProceduralAnimateArc(dc,task);
   return TRUE;
 }
 return FALSE; 
}

U0 AnimTaskFlip(CDC *dc, Director *task, Animation *ajc){
 if(task->flip){
  task->xAOff = ajc->xAOff;
  task->yAOff = ajc->yAOff;
  CDC *flipped = DCFlippedX(ajc->frame); 
  GrBlot3(dc,task->x+ajc->xOffset,
             task->y+ajc->yOffset,
             task->z,
             flipped);
  DCDel(flipped);   
 }else{
  task->xAOff = -ajc->xAOff-1;
  task->yAOff = -ajc->yAOff-1;
  GrBlot3(dc,task->x+ajc->xOffset,
            task->y+ajc->yOffset,
            task->z,
            ajc->frame);
 }
}

U0 OptionallyDrawWeapon(CDC *dc, Director *task, Animation *ajc){
 Item *wep = MakeItem(task->a->sword);
 switch(task->cQueDirective){
  case T1STAB...T4STAB:
   BlotItem(dc,wep,task->x+ajc->xOffset,
            task->y+ajc->yOffset,FALSE,90);
  break;
  case T1SLASH...T4SLASH:
   BlotItem(dc,wep,task->x+ajc->xOffset,
            task->y+ajc->yOffset,FALSE);
  break;
 }
 Free(wep);

}

//returns true for hard end
Bool EndAnimation(Animation *ajc, Director *task)
{
 ajc->frameDurationIndex=0;
 Animation *tmp = ajc->next;
 task->animIndex = task->animIndex+1;
 if(tmp->frameIndex<=ajc->frameIndex){
   switch(task->cQueDirective){
    case T1DIE...T4DIE:
    case EFFFIRE:
    case EFFBANNER:
     task->animIndex=0; //repeat last frame forever
    break;
    default:            
     ResetDirective(task);
     task->a->visible = TRUE;  
     return TRUE;
    break;
   }
 }
 return FALSE;
}


U0 PlayAnimation(CDC *dc, Director *task){
 I64 i;
 I64 cnt = QueCnt(allAnimations); 
 Animation *ajc = allAnimations.next;
 if(ProceduralInit(dc,task))
  goto taskend;

 //find animation 
 for(i=0;i<cnt;i++){
  if(task->cQueDirective!=ajc->key)
   ajc = ajc->next;
 }

 //index to current frame 
 while(task->animIndex!=ajc->frameIndex){ 
  ajc = ajc->next;
 }

 //increment display counter
 if(ajc->frameDurationIndex<ajc->frameDuration){
  ajc->frameDurationIndex++;
 }else{
  if(EndAnimation(ajc,task))
   goto taskend;
 }
 AnimTaskFlip(dc,task,ajc);
 OptionallyDrawWeapon(dc,task,ajc); 
 taskend:
 
}



U0 InitializeAnimator(){
  //initialize empty job queue
  QueInit(&allAnimations);
  QueInit(&direct);
  CreateAnimation(T1FISH);
  CreateAnimation(T2FISH);
  CreateAnimation(T3FISH);
  CreateAnimation(T4FISH);

  CreateAnimation(T1READY);
  CreateAnimation(T2READY);
  CreateAnimation(T3READY);
  CreateAnimation(T4READY);

  CreateAnimation(T1PUNCH);
  CreateAnimation(T2PUNCH);
  CreateAnimation(T3PUNCH);
  CreateAnimation(T4PUNCH);

  CreateAnimation(T1STAB);
  CreateAnimation(T2STAB);
  CreateAnimation(T3STAB);
  CreateAnimation(T4STAB);
 
  
  CreateAnimation(BOUNCE);
  CreateAnimation(ARCSTRIKE);

  CreateAnimation(T1DIE);
  CreateAnimation(T2DIE);
  CreateAnimation(T3DIE);
  CreateAnimation(T4DIE);

  CreateAnimation(T1HURT);
  CreateAnimation(T2HURT);
  CreateAnimation(T3HURT);
  CreateAnimation(T4HURT);
            
  CreateAnimation(T1CAST);
  CreateAnimation(T2CAST);
  CreateAnimation(T3CAST);
  CreateAnimation(T4CAST);
  CreateAnimation(T1SLEEP);
  CreateAnimation(T2SLEEP);
  CreateAnimation(T3SLEEP);
  CreateAnimation(T4SLEEP);

  CreateAnimation(T1EFFHEAL);
  CreateAnimation(EFFFISH);
  CreateAnimation(EFFSLEEP);                
  CreateAnimation(EFFFIRE);
  CreateAnimation(EFFCLICK);
  CreateAnimation(EFFSCRATCH);
  CreateAnimation(EFFBANNER);

 //load all animations into the hashtable 
}        
        
U0 CheckAnimQueue(CDC *dc,I64 y,I64 ty){
 Director *task = direct.next;
 I64 i=0;
 while (task != &direct) { //for(i=0;i!=QueCnt(direct);i++){
  if(task->cQueDirective!=NoDirective){
   //estimate this task row to account for drawing offsets
   //this is necessary to ensure foreground draws properly
   if((task->tileY==DELIMITER&&task->y<=y+10&&task->y>=y-35)
      ||(task->tileY==ty&&task->tileY!=DELIMITER))
    PlayAnimation(dc,task);
   task = task->next;   
 
  }                    
  else{
   Director *temp = task;//use temp to continue loop  
   task = task->next;              
   FreeTask(temp);        
  }                 
 }                     
}                   


U0 DrawDead(CDC *dc, Actor *a)
{
 I64 directive = T1DIE;
 CDC *frame;

 switch(a->face){
  case T_JUDA:
   directive = T1DIE;
   frame = AAE114;
  break;

  case T_LEVI:
   directive = T2DIE;
   frame = AAE167;
  break;

  case T_EPHR:
   directive = T3DIE;
   frame = AAE6;
  break;

  case T_BENJ:
   directive = T4DIE;
   frame = AAE60;
  break;

  case T_DOG:
   Sprite3B(dc,0,32,10,GetDog(TRUE));
   return;
 }

 // Start death animation once
 if(!HasDirective(directive,a) &&
    a->status1 != DEAD_STATUS)
 {
  AddDirective(directive,a);
 }

 // Animation finished: mark as permanently dead
 if(a->status1 != DEAD_STATUS &&
    DeathAnimationFinished(a))
 {
  AddStatus(a,DEAD_STATUS);
  UpdateDirective(
   directive,
   a,
   0, 0, 0,
   TRUE
  );
 }

 // Draw stable corpse after animation
 if(a->status1 == DEAD_STATUS)
 {
  GrBlot3(dc,0,32,10,frame);
 }
}

U8 GetWalkOffsetX(U8 walkdir){
 U8 XOffset = 0;
 switch(walkdir){
  case 0://not walking
  break;
  case 1://left straight start
   XOffset=40;
  break;
  case 2://right straight start
   XOffset=-40;
  break;
  case 3://up straight start
  break;
  case 4://down straight start
  break;
  case 5://left left leg
   XOffset=30;
  break;
  case 6://right left leg
   XOffset=-30;
  break;
  case 7://up left leg
  break;
  case 8://down left leg
  break;
  case 9://left straight mid
   XOffset=20;
  break;
  case 10://right straight mid
   XOffset=-20;
  break;
  case 11://up straight mid
  break;
  case 12://down straight mid
  break;
  case 13://left right leg
   XOffset=10;
  break;
  case 14://right right leg
   XOffset=-10;
  break;
  case 15://up right leg
  break;
  case 16://down right leg 
  break;
 } 
 return XOffset; 
}

U8 GetWalkOffsetY(U8 walkdir){
 U8 YOffset = 0;
 switch(walkdir){
  case 0://not walking
  break;
  case 1://left straight start
  break;
  case 2://right straight start
  break;
  case 3://up straight start
   YOffset=40;
  break;
  case 4://down straight start
   YOffset=-40;
  break;
  case 5://left left leg
  break;
  case 6://right left leg
  break;
  case 7://up left leg
   YOffset=30;
  break;
  case 8://down left leg
   YOffset=-30;
  break;
  case 9://left straight mid
  break;
  case 10://right straight mid
  break;
  case 11://up straight mid
   YOffset=20;
  break;
  case 12://down straight mid
   YOffset=-20;
  break;
  case 13://left right leg
  break;
  case 14://right right leg
  break;
  case 15://up right leg
   YOffset=10;
  break;
  case 16://down right leg 
   YOffset=-10;
  break;
 }
 return YOffset; 
}


