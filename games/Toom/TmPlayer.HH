class Psprite
{
  I64 state,tics,x,y;
};

class Player
{
  I64 forward,side,view_height,delta_view_height,buttons,bob,refire,extra_light;
  Psprite psprite[2];
  I64 health,armor,armor_type,damage_cnt,attacker,kills,ready_weapon,
	power[TM_POWER_NUM],pending_weapon,ammo[TM_AMMO_NUM],
	max_ammo[TM_AMMO_NUM],items,secrets,bonus_cnt,pickup_sprite,pickup_tics;
  Bool attack_down,no_momentum,god_mode,dead,backpack,weapon[TM_WEAPON_NUM],
	card[TM_CARD_NUM];
};
