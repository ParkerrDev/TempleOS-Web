Cd(__DIR__);;

// Constructing Graphics from WAD
#include "Data/Wad.HC";
#include "Data/Frames.HC";
#include "Data/Ids.HC";

// Loading Map
#include "Map/Map.HC";
#include "Map/Tensor3D.HC";
// Loading Graphics
#include "Sprites/SS1.HC"; 
#include "Sprites/SpriteSheet1.HC";
#include "Sprites/SpriteSheet2.HC";
#include "Sprites/SpriteSheet3.HC";
#include "Sprites/SpriteSheet4.HC";

// Loading Game Data
#include "Gameplay/Item.HC";
#include "Map/Actors.HC";
#include "Gameplay/Markov/Markov.HC";
#include "Map/Director.HC";
#include "Map/Level.HC";
#include "Globals.HC";
#include "Gameplay/AI.HC";

// Loading Workflows
#include "Dev/Dev.HC";
#include "Gameplay/InvLogic.HC";
#include "Dev/Deserialize.HC";
#include "Gameplay/TurnOrder.HC";
#include "Data/GUI.HC";

// Loading World
#include "Gameplay/Equipment.HC";
#include "Map/Objects.HC";
#include "Graphics/Dialog.HC";
#include "Gameplay/Player.HC";
#include "Gameplay/Save.HC";
#include "Online/Handshake.HC";

// Loading Animations
#include "Graphics/Walk.HC";
#include "Graphics/Anim.HC";
#include "Graphics/Armor.HC";
#include "Graphics/Buttons.HC";
#include "Graphics/Menu.HC";
#include "Graphics/Sidebar.HC";
#include "Graphics/Drag.HC";
#include "Gameplay/Fishing.HC";
#include "Graphics/Interact.HC";
#include "Music.HC";
#include "Graphics/Attacks.HC";
#include "Graphics/Prayers.HC";
#include "Gameplay/Combat.HC";
#include "Graphics/Render.HC";
#include "Graphics/Weather.HC";
#include "Graphics/Draw.HC";

// Handle Keys
#include "Gameplay/Inputs.HC";
#include "Dev/Keyboard.HC";

// Finalize World
#include "Map/World.HC";

// Multiplayer
#include "Online/Headers.HC";
#include "Online/Remote.HC";
#include "Online/Polling.HC";
#include "Online/Client.HC";
#include "Online/Server.HC";
#include "Online/Glowie_Artifact.HC";
#include "Online/Multiplayer.HC";

U0 InitMenuControl()
{
 I64 i;
 InitSprites;
 //narrative
 mc->currentSong=1;
 mc->currentMenu=0;
 mc->cutsceneTarget=0;//switch cutscene frames
 mc->cutsceneTimer =0;
 mc->cutsceneIndex=0;
 mc->talkieScene = IT_NULL;//dialogID
 mc->dialogName = "???";//dialog actor name
 mc->dialogID = 0;
 mc->controlLock =FALSE;

 //display
 mc->displayInventory=FALSE;
 mc->displayStats=FALSE;
 mc->displayWorld=FALSE;
 mc->displayShop=FALSE;
 mc->displayEquipment=FALSE;
 mc->displayPrayers=FALSE;
 mc->displayDev=FALSE;
 mc->displaySave=FALSE;
 mc->tickWeather=0;
 mc->screenXL=0;
 mc->screenYL=0;
 mc->smoothScreenX = 0;
 mc->smoothScreenY = 0;
 mc->clip=FALSE;
 mc->dialogSelection=0;

 //prayers
 mc->prayerPage=0;
 mc->dragPrayer=-1;
 mc->prayerToCast=DELIMITER;
 mc->isItem = FALSE;
 mc->isItemSelector = FALSE;
 mc->prayerListSize =0;
 mc->prayerList =MAlloc(sizeof(I64));
 mc->prayerListIndex =0;
 mc->prayerDragging=FALSE;

 //inventory
 mc->draggingInv=FALSE;
 mc->dragInvIsPlayer=TRUE;
 mc->draggingItem=MakeItem(0);
 mc->draggingID=0;

 //chest
 mc->lootedSwitch=FALSE;
 mc->lootInv=NULL;// player->myInv;
 ObjQueInit;

 //combat
 mc->combatON = FALSE;
 mc->combatMenuStage =STAGE_0;
 mc->combatMenuSelection=CMS_MOVE;
 mc->mouseTargetingActive=FALSE;
 mc->targetCTPIndex = 0;
 mc->running =  FALSE;

 //network
 mc->netMode = NET_SINGLEPLAYER;
 mc->hostInitialized = FALSE;
 mc->clientInitialized = FALSE;
 mc->localPlayerId = PLAYER;
 mc->nextClientId = -1;
 for(i=0;i<MAX_PLAYERS;i++)
  mc->clients[i] = NULL;
}

U0 InitHotKeys()
{
 I64 a;
 for(a=0;a<NUM_HOTKEYS;a++) {
  hotkeys[a] = -1;               
 }
}

U0 InitCamera()
{
 //camera;    
 camera->dividX = SCREENX/(11);
 camera->dividY = SCREENY/(11);
 camera->topLR=0; camera->topUD=0;
 camera->cameraOffSetX = 0,  
 camera->cameraOffSetY = 0;
 camera->cameraMovedThisStep = FALSE; 

}
U0 InitKeyboard()
{
 keyboard.up.isDown=FALSE;
 keyboard.down.isDown=FALSE;
 keyboard.left.isDown=FALSE;
 keyboard.right.isDown=FALSE;
 keyboard.inv.isDown=FALSE;
 keyboard.equipment.isDown=FALSE;
 keyboard.stats.isDown=FALSE;
 keyboard.developer.isDown=FALSE;
 keyboard.esc.isDown=FALSE;
 keyboard.enter.isDown=FALSE;
 keyboard.shift.isDown=FALSE;

}
U0 Init(){ //world
 world = CAlloc(sizeof(World));
 mc = CAlloc(sizeof(MenuControl));
 camera= CAlloc(sizeof(Camera));
 worldSz = CreateVector(3);
 wX = 100; wY = 100; wZ = 1;
 SetVector(worldSz,wX,0);
 SetVector(worldSz,wY,1);
 SetVector(worldSz,wZ,2);
 world->level = CreateTensor(worldSz);
 world->timer = 0;
 world->gameTicks=0; 
 InitActors(0);
 InitMenuControl;
 InitCamera;       
 InitHotKeys;
 InitDev;
 InitKeyboard;
 //prayers
 InitializePrayers;

 //Level and NPCS

 SetTensorNPC(world->level,0,3,2,0);//player
 SMFT(world->level,MakeCastle(GetMatrixFromTensor(world->level,0)),0);//castle



 InitializeAnimator;
}

U0 FreeEverything(){

}

#include "RPG";
