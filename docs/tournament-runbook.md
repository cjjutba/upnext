# Tournament runbook

Use a synthetic tournament to rehearse on the phone or tablet that will run the event. Confirm the published division rules, registered entries, date and court availability before locking anything. The date starts blank and the rule fields start with example values.

## Set up

1. Open Upnext and choose **Tournament**, then **Create tournament**. On **Setup**, enter the event name and date. Add each court and enter its availability if it has restricted hours. Times use the device's local clock. Choose **Save event details**.
2. In **Player roster**, add each person once. Reuse that roster record if the person plays in multiple divisions. In **Unidos**, open **Entries** and add eligible club members. In each Plaridel Open division, open **Teams** and register its fixed pairs.
3. Under **Edit division rules**, set the score format, tie rule and how withdrawals affect remaining matches. Use a single round robin or set both pool sizes and the number advancing from each. Joint places at a qualifying position leave the playoff slot pending. Choose the published tiebreak option if you need to resolve that position.
4. For Unidos with rotating partners, set the games-per-player target, lock the division, then choose **Preview draw**. Check the pairs and the game counts, then choose **Lock draw**. Draw each remaining match the same way. For fixed blind partners, choose **Draw fixed partners once**. Preview the pairs and lock that draw when you're ready to generate the fixtures. A reload preserves the preview and the confirmed draws. If the entries need changing before a blind draw locks, choose **Discard preview** first.
5. Review and lock each Open division. This generates the fixtures. Save a backup before the first match.

## Run the courts

- Choose **Courts**. In **Fixtures**, pick a court for a waiting match and choose **Assign match**. Confirm the players are present, then choose **Start match** on its court card. A booked court or player blocks a conflicting assignment.
- Choose **Record score** and enter the points beside each side. For best-of matches, add rows for the games actually played. Choose **Save result**. Use **Record forfeit** and give a reason when a side forfeits. To withdraw a team or rotating player, return to the division's **Teams** or **Entries** on **Setup**.
- Choose **Standings** and the division to check provisional, tied or final places. Open **Why this rank?** to see the rules, values and games behind a place. When the division calls for a tie playoff, play it and record the order and result.
- To correct a score, set the fixture filter to **Finished** and choose **Edit result**. Enter a reason. Review any playoff pairing changes. If an affected match has started, explicitly choose whether to keep its pairing or reset the affected matches. Reset removes their current court assignment, start and result, so replay them under the corrected pairing.

## Back up and recover

1. From any stage, choose **Backup** then **Save backup**. Keep the JSON file outside the browser. Save again at the end of pool play and after the last match.
2. If the app reloads during play, reopen **Tournament** and verify the court, draw and last score before making another entry. To reopen a different tournament already on the device, use **Backup** then **Tournament list**.
3. To restore, open **Tournament** on a device with Upnext already loaded. Choose **Restore backup**, pick the JSON file, check the tournament and time, then choose **Confirm restore**. Check the latest score and active courts against your event record. Restoring the same file twice does not duplicate its activity.
4. If the backup conflicts with the saved tournament, keep both copies. Open the backup on a separate device or browser profile to compare before resuming. Casual session exports and tournament backups use their separate restore options.
