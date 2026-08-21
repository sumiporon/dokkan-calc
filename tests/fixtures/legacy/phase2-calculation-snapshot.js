// Frozen from production commit 0a78ae84e133982f6942df262a4e6d12d8c2dcd8.
// This file records Phase 2 behavior for comparisons. It is not a correctness
// specification and is never loaded by the browser application.

    const calculateNewDurability = (scenarioData) => {
      const {
        char_def, leader, field, passive, memory, link, multi_passive, super_attack, active, support_item,
        own_class = 'super', own_type = 'teq',
        enemy_class = 'super', enemy_type = 'teq',
        attr_def_up = 0, is_guard = false, dr_input = 0,
        is_critical = false, crit_atk_up = 0, crit_def_down = 0
      } = scenarioData;

      let final_def = (parseFloat(char_def) || 0) *
        (1 + (parseFloat(leader) || 0) / 100) *
        (1 + (parseFloat(field) || 0) / 100) *
        (1 + (parseFloat(passive) || 0) / 100) *
        (1 + (parseFloat(memory) || 0) / 100) *
        (1 + (parseFloat(link) || 0) / 100) *
        (1 + (parseFloat(multi_passive) || 0) / 100) *
        (1 + (parseFloat(super_attack) || 0) / 100) *
        (1 + (parseFloat(active) || 0) / 100) *
        (1 + (parseFloat(support_item) || 0) / 100);

      const typeAdvantageMap = { teq: 'agl', agl: 'str', str: 'phy', phy: 'int', 'int': 'teq' };
      let group1_advantage_status = 'neutral';
      if (typeAdvantageMap[own_type] === enemy_type) {
        group1_advantage_status = 'advantage';
      } else if (typeAdvantageMap[enemy_type] === own_type) {
        group1_advantage_status = 'disadvantage';
      }

      let guard_mod = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;
      let attr_mod = 1.0;
      const is_same_class = own_class === enemy_class;
      if (is_same_class) {
        if (group1_advantage_status === 'advantage') attr_mod = 0.9;
        else if (group1_advantage_status === 'disadvantage') attr_mod = 1.25;
      } else {
        if (group1_advantage_status === 'advantage') attr_mod = 1.0;
        else if (group1_advantage_status === 'disadvantage') attr_mod = 1.5;
        else attr_mod = 1.15;
      }

      if (is_guard) {
        attr_mod = 0.8;
        guard_mod = 0.5;
      }

      if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
        attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
      }

      let atk_crit_mod = 1.0;
      let def_crit_mod = 1.0;
      if (is_critical) {
        atk_crit_mod = 1 + ((parseFloat(crit_atk_up) || 0) / 100);
        def_crit_mod = 1 - ((parseFloat(crit_def_down) || 0) / 100);

        if (is_guard) {
          attr_mod = 0.8;
          guard_mod = 0.5;
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        } else {
          attr_mod = 1.0;
          guard_mod = 1.0;
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        }
      }

      const dr_mod = 1 - ((parseFloat(dr_input) || 0) / 100);

      return {
        final_def: final_def,
        final_def_crit_mod: final_def * def_crit_mod,
        attr_mod: Math.max(0, attr_mod),
        guard_mod,
        dr_mod,
        atk_crit_mod,
        group1_advantage_status
      };
    };

    const updateScenarioResults = (card) => {
      const turnPct = 0;
      const hitPct = 0;
      const hpPct = 0;
      const appearPct = 0;
      const totalAtkUpPct = turnPct + hitPct + hpPct + appearPct;
      const legacyFirstTurnOption = '<option value="0">なし</option>';
      return { card, totalAtkUpPct, legacyFirstTurnOption };
    };
