//
//Current Directory
//

CDirEntry *loadRoot;

//serialize options
#define OPT_MC_FX_OFF   0
#define OPT_MC_FX_ON    1
#define OPT_MC_MUS_OFF  2
#define OPT_MC_MUS_ON   3

#define SCREENX 480
#define SCREENY 480
#define SIDEX 160
#define SIDEY 480

#define NET_SINGLEPLAYER 0
#define NET_HOST 1
#define NET_CLIENT 2

#define MAX_PLAYERS 4
#define STARTCLIENTS 9

//Loaded Map
class World
{
 I64 currentZ;
 Tensor3D *level;
 I64 timer;
 I64 gameTicks;
};

class PathNode {
 I64 x, y;
 I64 g, h, f;
 I64 parentIndex;
 Bool open;
 Bool closed;
};

//Keyboard configuration
class KeyState {
 Bool isDown;   // 1 if key is currently held
 Bool wasDown;  // 1 if key was held last frame
};

class NetClient {
    I64 fd;
    I64 actorId;
};

class Keys{
 KeyState up;
 KeyState down;
 KeyState left;
 KeyState right;
 KeyState inv;
 KeyState equipment;
 KeyState stats;
 KeyState developer;
 KeyState esc;
 KeyState enter;
 KeyState shift;
} keyboard;

Bool KeyPressed(KeyState *k) {   // edge: up -> down
 return k->isDown && !k->wasDown;
}

Bool KeyReleased(KeyState *k) {  // edge: down -> up
 return !k->isDown && k->wasDown;
}

#define NUM_HOTKEYS 9
I64 hotkeys[NUM_HOTKEYS] ;

#define AGGRO_DIS	2
#define MOVEMENT_COST		5
#define W_T 90
//looting constants for 
//looting previous corpse check
#define LOOTED		0
#define LOOTING		1
#define LOOTABLE	2


//combat menu stage
#define STAGE_0                 0
#define STAGE_1                 1


//combat Menu Selection

#define CMS_MOVE		0
#define CS_MOVE			10
#define CMS_MOVE_DONE		100

#define CMS_STRIKE		1
#define CS_STRIKE		11
#define CMS_STRIKE_DONE		111

#define CMS_PRAYER		2
#define CS_PRAYER		12
#define CS_PRAYER2		122
#define CMS_PRAYER_DONE		112
#define DELIMITER -9348934

#define CMS_FLEE		3
#define CS_FLEE			13
#define CMS_FLEE_DONE		113

#define CMS_ENE1                 4
#define CMS_ENE2                 5



//global settings class for game session
class MenuControl{

  //Display
  I64 tickWeather,screenXL,screenYL,
      smoothScreenY,smoothScreenX;
  Bool clip;

  //Narrative Control
  Bool fxMuted,musicMuted,controlLock;
  I32 currentSong,//for draw and song threads
      currentMenu,//foreign key
      cutsceneTarget;//switch cutscene frames
  I64 cutsceneTimer,cutsceneIndex;

  //Dialog
  I64 talkieScene,dialogID,dialogSelection;//textID,actorID
  U8* dialogName;//dialog actor name

  //Looting
  Bool lootedSwitch;//true/false open gui
  Inventory *lootInv;//inv object

  //combat preferences
  Bool combatON;//determines if combat is initiated
  U16 combatMenuStage; //switches between characters in a combat queue
  U8 combatMenuSelection; //affects combat dialog options
  U8 turnIndex;//used for specific world tick timers
  U8 combatTurn;//whose turn it is
  Bool running;

  //players current target
  Actor *target;
  I64 targetCTPIndex;
  Bool mouseTargetingActive;

  //prayerSelection
  I64 prayerToCast, dragPrayer, prayerListIndex, prayerListSize;
  I64 *prayerList;
  Bool isItem, isItemSelector;

  //inventory menus render
  I64 draggingID;//inventory mouse item
  Bool dragInvIsPlayer;//original inv
  Item *draggingItem;

  //submenu display toggles
  Bool displayInventory,draggingInv, 
       displayStats, displayWorld,
       displayPrayers,prayerPage,prayerDragging,
       displayShop,
       displayEquipment,
       displayDev,
       displaySave;

  //Network
  I64 netMode, hostSocket, serverSocket,
      clientCount,localPlayerId,nextClientId;
  CNetAddr *hostAddr;
  NetClient *clients[MAX_PLAYERS];
  Bool hostInitialized, clientInitialized; 
  

};

class Camera{
 F64 dividX, dividY;//ratio tile to screen h/w
 I64 cursorX, cursorY,//cursor positions 
      topLR,topUD,//for preventing pan at map corners
      cameraOffSetX,cameraOffSetY;//offset for smooth
                            //animation transition on underlying matrix
 Bool cameraMovedThisStep; 
};

//
// Cached Combat queue
//
class CombatTurn:CQue
{
  Actor *ready;
} combatCQue;
//
//Global variables
//

I64 wX,wY,wZ;
CombatTurn *ctp;
CombatTurn *targetCTP;
MenuControl *mc;
Prayers *prayers;
Camera *camera;
World *world;//world
Vector *worldSz;//world size, with values wX,wY,wZ

Actor *GetPlayer(){
 I64 id = mc->localPlayerId;
 Actor *fetch = actors->next;
 while(fetch != actors){
  if(fetch->id==id)
   return fetch;
  fetch = fetch->next;
 }
}

