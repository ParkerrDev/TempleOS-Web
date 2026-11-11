I64 tm_worker_snd_active,tm_worker_snd_period,tm_worker_snd_paused,
      tm_worker_snd_owner,tm_worker_snd_loaded,tm_worker_snd_gate;

U0 TmWorkerAudio()
{
  U8 *play,*audio,*speaker,*bank;
  CHashFun *draw;
  I64 play_audio,audio_bank,audio_speaker,audio_task,bank_loaded,
	speaker_sound,speaker_period,speaker_paused;
  tm_worker_snd_active=tm_worker_snd_period=tm_worker_snd_paused=0;
  tm_worker_snd_owner=tm_worker_snd_loaded=0;
  tm_worker_snd_gate=InU8(0x61)&3;
  if (!TaskValidate(tm_worker_task)) return;
  draw=HashFind("PlayDrawIt",tm_worker_task->hash_table,HTT_FUN);
  if (!draw) return;
  play_audio=TmWorkerMember("Play","audio");
  audio_bank=TmWorkerMember("Audio","bank");
  audio_speaker=TmWorkerMember("Audio","speaker");
  audio_task=TmWorkerMember("Audio","task");
  bank_loaded=TmWorkerMember("SoundBank","loaded");
  speaker_sound=TmWorkerMember("Speaker","sound");
  speaker_period=TmWorkerMember("Speaker","period");
  speaker_paused=TmWorkerMember("Speaker","paused");
  PUSHFD
  CLI
  if (tm_worker_task->draw_it==draw->exe_addr &&
      (play=tm_worker_task->user_data)) {
    audio=*(play+play_audio)(U8 **);
    bank=*(audio+audio_bank)(U8 **); speaker=audio+audio_speaker;
    tm_worker_snd_owner=*(audio+audio_task)(CTask **)==tm_worker_task &&
	  TaskValidate(tm_worker_task->song_task);
    tm_worker_snd_loaded=bank[bank_loaded+1];
    tm_worker_snd_active=!!*(speaker+speaker_sound)(U8 **);
    tm_worker_snd_period=*(speaker+speaker_period)(I64 *);
    tm_worker_snd_paused=speaker[speaker_paused];
    tm_worker_snd_gate=InU8(0x61)&3;
  }
  POPFD
}

U0 TmWorkerWeaponReady()
{//The first displayed frame precedes the pistol's native raise animation.
  U8 *play=tm_worker_task->user_data,*game,*level,*player,*data,*info;
  CHashClass *tmpc;
  I64 state,ready,n;
  F64 end=tS+30;
  game=*(play+TmWorkerMember("Play","game"))(U8 **);
  level=*(game+TmWorkerMember("Game","level"))(U8 **);
  player=level+TmWorkerMember("Level","player");
  data=*(game+TmWorkerMember("Game","data"))(U8 **);
  info=*(data+TmWorkerMember("GameData","weapon"))(U8 **);
  n=*(player+TmWorkerMember("Player","ready_weapon"))(I64 *);
  tmpc=HashFind("WeaponInfo",tm_worker_task->hash_table,HTT_CLASS);
  if (!tmpc || n!=1) throw('Weapon');
  ready=*(info+n*tmpc->size+TmWorkerMember("WeaponInfo","ready"))(I32 *);
  state=TmWorkerMember("Player","psprite")+TmWorkerMember("Psprite","state");
  while (*(player+state)(I64 *)!=ready) {
    if (tS>=end) throw('Ready');
    Sleep(10);
  }
}

U0 TmWorkerFire()
{//Observe a completed shot, not a transient sample between two song ticks.
  F64 end=tS+5;
  U8 *play=tm_worker_task->user_data,*game,*level,*player;
  I64 ammo;
  game=*(play+TmWorkerMember("Play","game"))(U8 **);
  level=*(game+TmWorkerMember("Game","level"))(U8 **);
  player=level+TmWorkerMember("Level","player");
  ammo=TmWorkerMember("Player","ammo");
  do {
    TmWorkerAudio;
    if (tm_worker_snd_owner && tm_worker_snd_loaded &&
	  *(player+ammo)(I64 *)<50) return;
    Sleep(10);
  } while (tS<end);
  throw('Fire');
}
