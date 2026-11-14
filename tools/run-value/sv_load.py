import pandas as pd, numpy as np, glob
COLS=['pitch_type','game_date','pitcher','batter','events','description','game_type','stand','p_throws','balls','strikes','on_3b','on_2b','on_1b','outs_when_up','inning','inning_topbot','game_pk','at_bat_number','pitch_number','launch_speed','launch_angle','estimated_woba_using_speedangle','woba_value','woba_denom','bat_score','post_bat_score','delta_run_exp','delta_pitcher_run_exp','home_team','type','des']
def load(y):
    d=pd.concat([pd.read_parquet(f,columns=COLS) for f in sorted(glob.glob(f'/home/claude/dl_statcast/{y}/*.parquet'))],ignore_index=True)
    return d
