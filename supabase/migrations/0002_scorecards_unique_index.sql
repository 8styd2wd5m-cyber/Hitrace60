create unique index if not exists scorecards_event_station_heat_participant_idx
on scorecards(event_id, station_id, heat_id, participant_id);
