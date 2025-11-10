import { GameState, CharacterEvent } from '../models';

export const CHARACTER_EVENTS: CharacterEvent[] = [
  {
    id: 'ISAKU_HERB_QUEST_START',
    characterName: '젠포우지 이사쿠',
    title: '불운 속의 희귀 약초',
    trigger: (state: GameState) =>
      state.currentLocation === '의무실' &&
      state.npcs['젠포우지 이사쿠'].affection >= 70 &&
      !state.eventLog['ISAKU_HERB_QUEST_START'],
    prompt: `플레이어가 의무실로 들어서자, 젠포우지 이사쿠가 평소와 달리 심각한 표정으로 약초를 정리하고 있습니다. 플레이어를 발견한 그는 잠시 망설이다가, 귀한 약재가 필요하지만 자신의 불운 때문에 구하기 어렵다며 은밀한 부탁을 합니다. 희귀한 약초를 함께 찾아달라는 특별한 이벤트가 시작됩니다. 이 상황을 생생하게 묘사하고, 플레이어에게 수락하거나 거절하는 선택지를 제시해주세요.`
  },
  {
    id: 'SENZO_SECRET_TRAINING',
    characterName: '타치바나 센조',
    title: '달빛 아래 비밀 훈련',
    trigger: (state: GameState) =>
      state.currentLocation === '훈련장' &&
      state.npcs['타치바나 센조'].affection >= 70 &&
      !state.eventLog['SENZO_SECRET_TRAINING'],
    prompt: `플레이어가 훈련장에 도착하자, 그곳에는 혼자 수련에 몰두하고 있는 타치바나 센조가 있습니다. 그는 플레이어의 실력을 인정하며, 자신만이 알고 있는 고난이도의 인술 훈련을 함께하지 않겠냐고 제안합니다. 이는 단순한 훈련이 아닌, 서로의 한계를 시험하는 특별한 시간입니다. 이 제안의 긴장감과 특별함을 묘사하고, 플레이어에게 선택지를 제시해주세요.`
  },
  {
    id: 'MONJIRO_LATE_NIGHT_SNACK',
    characterName: '시오에 몬지로',
    title: '늦은 밤의 주먹밥',
    trigger: (state: GameState) =>
        state.currentLocation === '식당' &&
        state.npcs['시오에 몬지로'].affection >= 70 &&
        !state.eventLog['MONJIRO_LATE_NIGHT_SNACK'],
    prompt: `늦은 밤, 출출함을 느껴 식당으로 가자 그곳에서 시오에 몬지로가 장부를 정리하며 주먹밥을 먹고 있습니다. 그는 플레이어를 발견하고는, 잠시 머뭇거리다 옆자리를 내어주며 주먹밥을 건넵니다. 항상 단련에 미쳐있는 그가 보여주는 드문 평온한 모습입니다. 이 특별하고 조용한 순간을 묘사하고, 플레이어에게 대화를 시작하거나 조용히 주먹밥만 먹는 선택지를 제시해주세요.`
  },
   {
    id: 'Tomesaburo_And_Isaku_Argument',
    characterName: '케마 토메사부로',
    title: '이사쿠는 내가 지킨다!',
    trigger: (state: GameState) =>
      state.currentLocation === '정원' &&
      state.npcs['케마 토메사부로'].affection >= 65 &&
      !state.eventLog['Tomesaburo_And_Isaku_Argument'],
    prompt: `정원을 지나가던 중, 케마 토메사부로와 젠포우지 이사쿠가 함께 있는 것을 발견합니다. 토메사부로는 또다시 불운한 일을 당할 뻔한 이사쿠에게 "그러니까 내가 옆에 있어야 한다!"라며 열변을 토하고 있고, 이사쿠는 곤란한 듯 웃고 있습니다. 토메사부로는 플레이어를 발견하고는, 이사쿠의 불운에 대해 어떻게 생각하는지 물어보며 대화에 끌어들입니다. 이 상황을 묘사하고 플레이어에게 토메사부로의 편을 들거나, 이사쿠를 감싸거나, 혹은 둘 다 진정시키는 선택지를 제시해주세요.`
  }
];
