# DSH Session Delete

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/Dubai1210/dsh-session-delete)

鍦ㄤ細璇濄€屸嫰銆嶈彍鍗曠殑銆屽綊妗ｄ細璇濄€嶄笅闈㈠涓€椤?**鍒犻櫎浼氳瘽**锛氱偣涓€涓嬨€佺‘璁や竴娆★紝杩欎釜浼氳瘽杩炲悓瀹冨湪纾佺洏涓婄殑鍏ㄩ儴鏁版嵁銆佷互鍙婂畠鍦ㄨ繖涓伐浣滃尯閲屾搷浣滆繃鐨勬枃浠讹紝涓€璧峰垹鎺夈€?
DSH 鑷甫鐨勩€屽綊妗ｃ€嶅彧鏄妸浼氳瘽浠庡垪琛ㄩ噷鎸蛋锛屾枃浠惰繕鍦ㄣ€佸彲浠ュ彇娑堝綊妗ｆ仮澶嶃€傝繖涓彃浠惰ˉ涓婄湡姝ｄ笉鍙€嗙殑閭ｄ竴姝ャ€?
## 鍔熻兘

- 鑿滃崟椤规彃鍦?`sidebar.workspaces.session.menu.item` 鎻掓Ы **order 410**锛屽嵆銆屽綊妗ｄ細璇濄€嶄箣鍚庛€併€屼細璇?ID銆嶄箣鍓?- 鍨冨溇妗跺浘鏍囷紝鐐瑰嚮鍏堝叧闂彍鍗曪紝鍐嶅脊鍑轰簩娆＄‘璁ゆ锛堟樉绀轰細璇濇爣棰橈紝鏄庣‘鍐?鏃犳硶鎭㈠"锛?- 纭鍚?Host 渚т竴娆℃€у畬鎴愭竻鐞嗭紝鎵€鏈夊凡鎵撳紑鐨勭獥鍙ｇ珛鍒绘妸璇ヨ绉婚櫎

## 鍒犻櫎鑼冨洿

涓€娆¤皟鐢ㄤ細鍒犳帀涓嬮潰杩欎簺锛岀己涓€涓嶅彲锛?
| 鏁版嵁 | 澶勭悊 |
| --- | --- |
| 宸ヤ綔鍖烘枃浠?| 璇ヤ細璇濈敤鍐欐枃浠跺伐鍏风杩囩殑鏂囦欢锛岄€愪釜 `rm`锛岄殢鍚庢竻鎺夊洜姝ゅ彉绌虹殑鐩綍锛堜笉瓒婅繃浼氳瘽 `cwd`锛?|
| 姝ｅ湪杩愯鐨?agent | `cancel({kind:"user"})` + `agent.scope.dispose()`锛岄噴鏀炬棩蹇楁枃浠跺彞鏌?|
| 浼氳瘽鏃ュ織鐩綍 | `~/.dsh/sessions/<project>/<session-id>/` 鏁寸洰褰曞垹闄わ紙`session.v4.jsonl.zstd` 绛変笘浠ｆ棩蹇楋級 |
| 鎶曞奖缂撳瓨 | `storages/session_projcache` 閲岃浼氳瘽鐨勮锛堝惈鎶曞奖鍚庣殑娑堟伅姝ｆ枃锛?|
| 宸ヤ綔鍖哄綊灞?| 浠庢瘡涓伐浣滃尯璁板綍鐨?`sessionIds` 涓?`detachSession` |
| 褰掓。 / 缃《闆嗗悎 | 鍏ㄥ眬 `archivedSessionIds`銆乣pinnedSessionIds` 涓Щ闄?|
| 瀹㈡埛绔垪琛?| `ctx.emit("api-session/removed", id)` 鈫?鎵€鏈夌獥鍙ｅ疄鏃剁Щ闄よ琛?|

鍒犻櫎**涓嶈繘鍥炴敹绔?*锛屼笉鍙仮澶嶃€?
## 宸ヤ綔鍖烘枃浠舵€庝箞璁ゅ畾

- 鎵撳紑纭妗嗘椂涓嶅姩纾佺洏锛屼篃涓嶉渶瑕侀澶栬姹傦細纭鍚?Host 渚цВ鏋愯浼氳瘽鐨勮浆褰曟棩蹇楋紝鎵弿 `tool/call` 浜嬩欢锛屽彇鍑哄啓鏂囦欢宸ュ叿锛坄write` / `edit` / `multi_edit` / `apply_patch` / `str_replace_editor` / `ops_write` / `ops_edit` / `create_file`锛夌殑璺緞鍙傛暟
- 鍙鐞嗕細璇濆伐浣滃尯鐩綍锛坄cwd`锛夊唴閮ㄧ殑璺緞锛涜秺鐣岃矾寰勶紙`../`銆佺粷瀵硅矾寰勬寚鍚戝埆澶勩€乣.git` 鍐呴儴锛変竴寰嬭烦杩?- 鏂囦欢鍒犲畬鍚庢妸瀹冪暀涓嬬殑绌虹洰褰曚竴骞跺垹鎺夛紝浣嗕笉浼氬姩 `cwd` 鏈韩

鍋氫笉鍒扮殑閮ㄥ垎锛堟槑纭啓鍦ㄨ繖閲岋紝閬垮厤璇В锛夛細

- **閫氳繃 shell 鍛戒护鍐欏嚭鐨勬枃浠朵笉鍦ㄥ綊灞炶寖鍥村唴**銆俙bash` / `ops_bash` 鐨勫懡浠よ鍙湁瀛楃涓诧紝娌℃湁鍙В鏋愮殑鐩爣璺緞锛屾彃浠朵笉浼氬幓鐚?- 瀛愪細璇濓紙subagent锛夊啓鍑虹殑鏂囦欢涓嶈鍏ョ埗浼氳瘽锛涜娓呭氨鍒犲搴斿瓙浼氳瘽
- 銆屼慨鏀广€嶇被鏂囦欢鍙垹涓嶈繕鍘?鈥斺€?鍘熷唴瀹瑰凡琚鐩栵紝娌℃湁澶囦唤锛涢渶瑕佹棫鐗堟湰璇烽潬鑷繁鐨?git

## 瀹夎

婧愮爜瀹夎锛圙itHub锛夛細

```bash
dsh plugin --profile web add github:Dubai1210/dsh-session-delete
```

鏈湴鐩綍瀹夎锛堝紑鍙戣皟璇曪級锛?
```bash
dsh plugin --profile desktop add link:/path/to/dsh-session-delete
```

瀹夎鍚?*鍒锋柊涓€娆?DSH 绐楀彛**锛圕trl+R锛夎 client bundle 鍔犺浇锛涘鏋滆彍鍗曢噷娌℃湁鍑虹幇鏂伴」锛岄噸鍚竴娆?DSH銆?
## 浣跨敤

1. 鍦ㄥ乏渚у伐浣滃尯鍒楄〃閲屾壘鍒扮洰鏍囦細璇濊锛岀偣琛屽熬鐨勩€屸嫰銆?2. 閫夋嫨銆屽綊妗ｄ細璇濄€嶄笅闈㈢殑銆?*鍒犻櫎浼氳瘽**銆?3. 纭妗嗛噷鏍稿鏍囬
4. 鐐广€屽垹闄ゃ€?5. 璇ヤ細璇濊娑堝け锛岀鐩樹笂鐨勫搴旂洰褰曞拰瀹冩搷浣滆繃鐨勬枃浠跺悓鏃惰鍒犻櫎

## 鏉冮檺涓庨闄?
- Host 鍗婂彧娉ㄥ唽涓€涓悓婧?HTTP 璺敱锛歚POST /dsh-session-delete/delete`銆傚悓婧愭牎楠岀収鎶?DSH 瀹樻柟鎻掍欢鐨勫仛娉曪細鎷掔粷 `sec-fetch-site: cross-site`銆乣origin: null`銆佷互鍙?`origin.host` 涓?`host` 澶翠笉涓€鑷寸殑璇锋眰
- 鍙搷浣滄湰鏈?`~/.dsh` 涓嬬殑浼氳瘽鏁版嵁銆佸伐浣滃尯娉ㄥ唽琛紝浠ュ強璇ヤ細璇濊嚜宸辨搷浣滆繃鐨勫伐浣滃尯鏂囦欢锛?*涓嶅彂璧蜂换浣曞閮ㄧ綉缁滆姹?*锛屼笉渚濊禆浠讳綍绗笁鏂规湇鍔?- 娌℃湁浠讳綍閬ユ祴銆佹病鏈夊悗鍙板父椹讳换鍔?- 椋庨櫓鐐癸細鍒犻櫎鏄案涔呮€х殑 鈥斺€?浼氳瘽鏃ュ織銆佸伐浣滃尯閲岃瀹冨啓杩?鏀硅繃鐨勬枃浠堕兘浼氭秷澶憋紝娌℃湁澶囦唤

## 鍏煎涓庤繍琛岃姹?
- DSH锛?.2.x锛坉esktop profile 涓?web profile 鍧囧彲锛?- 骞冲彴锛歐indows / macOS / Linux
- 杩愯鏃讹細Node.js >= 18锛圚ost 鍗婂彧鐢?`node:fs/promises` 涓?`node:path`锛?- 渚濊禆鐨勬湇鍔★細`webServer`銆乣sessions`銆乣agents`銆乣sessionPersistence`銆乣workspaceRegistry`銆乣storageDomain`锛屽叏閮ㄦ潵鑷?DSH 鍩虹 bundle锛屾棤棰濆渚濊禆

## 鑳藉姏鍒嗙被

鐣岄潰涓庝綋楠岋紙鍚屾椂娑夊強浼氳瘽涓庢秷鎭殑鏁版嵁娓呯悊锛?
## 瀹炵幇璇存槑

bundle 鎻掍欢锛屼袱鍗婏細

**Host** 鈥?`lib/index.js`锛屽鍑?`apply(ctx)`锛屾敞鍐屼竴涓?`webServer` exact 璺敱銆傚垹闄ゆ祦姘寸嚎锛?
1. 璇昏浆褰曟棩蹇楋紙澶氬抚 zstd锛夋嬁鍑鸿浼氳瘽纰拌繃鐨勫伐浣滃尯鏂囦欢锛岄€愪釜 `rm`锛屽啀娓呯┖鐩綍
2. 鍋滄椿 agent 骞堕噴鏀炬枃浠跺彞鏌?3. `sessionPersistence.locate({cwd, id})` 瀹氫綅鏃ュ織鏂囦欢锛宍rm -r` 鍏舵墍鍦ㄤ細璇濈洰褰?4. `storageDomain.get("session_projcache").table("sessions").delete(id)` 娓呮姇褰辩紦瀛樿
5. 閬嶅巻 `workspaceRegistry.list()`锛岄€愪釜 `entity.detachSession(id)`
6. `unarchiveSession(id)` + `unpinSession(id)` 娓呭叏灞€闆嗗悎
7. `ctx.emit("api-session/removed", id)` 閫氱煡鎵€鏈夊鎴风

姣忎竴姝ョ嫭绔?try/catch锛屽崟姝ュけ璐ヤ笉褰卞搷鍏朵綑姝ラ锛涜繑鍥炲€?`{ok, live, removedFiles, cacheRows, headerFound, workspace:{removed,failed,cwd}}` 渚夸簬鎺掓煡銆?
鏂囦欢褰掑睘瑙ｆ瀽鍦?`lib/transcript.js`锛氫細璇濇棩蹇楁槸**澶氬抚 zstd**锛堟瘡涓拷鍔犳壒娆′竴甯э級锛屼竴娆℃€?`zstdDecompressSync` 鍙兘瑙ｅ嚭绗竴甯э紝鎵€浠ヨ繖閲屽厛鎸?frame header / block header 璧颁竴閬嶇粨鏋勫畾浣嶆墍鏈夊畬鏁村抚鍐嶉€愬抚瑙ｅ帇锛涚劧鍚庢壂鎻?`tool/call` 浜嬩欢锛屾寜宸ュ叿鍚嶅彇璺緞鍙傛暟锛坄path` / `file_path` / `target_file`锛宍apply_patch` 璧?`*** Update File:` 琛岋級锛岀敤浼氳瘽 `cwd` 瑙勬暣骞舵嫆缁濊秺鐣岃矾寰勩€?
**Client** 鈥?`client.js`锛宍window.__ModuleLoader__.load` 娉ㄥ唽鎳掑伐鍘傦紝寰€涓や釜鎻掓Ы娉ㄥ唽锛?
- `sidebar.workspaces.session.menu.item` 鈫?鍒犻櫎鑿滃崟椤癸紙order 410锛?- `shell.overlay` 鈫?纭寮圭獥锛坄Modal` + 鍙栨秷/鍒犻櫎鎸夐挳锛?
纭鍚?`fetch("/dsh-session-delete/delete", {method:"POST"})`锛屽悓婧愩€乣credentials: same-origin`銆?
## 鐩綍缁撴瀯

```
dsh-session-delete/
鈹溾攢鈹€ package.json          # dsh.bundle.patch + dsh.client
鈹溾攢鈹€ cordis.patch.yml      # - insert: 瀹夸富鎻掍欢鏉＄洰
鈹溾攢鈹€ lib/index.js          # Host 鍗婏細璺敱 + 鍒犻櫎娴佹按绾?鈹溾攢鈹€ lib/transcript.js     # Host 鍗婏細澶氬抚 zstd 瑙ｇ爜 + 浼氳瘽鍐欐枃浠跺綊灞炶В鏋?鈹溾攢鈹€ client.js             # Client 鍗婏細鑿滃崟椤?+ 纭妗?鈹溾攢鈹€ locale/en.json        # meta.title / meta.description
鈹溾攢鈹€ locale/zh.json
鈹斺攢鈹€ icon.svg
```

## 寮€鍙?
鏀瑰畬鏂囦欢鍚庨噸鏂拌涓€娆″嵆鍙儹鐢熸晥锛圚ost 鍗婇渶瑕侀噸鏂板姞杞斤級锛?
```bash
dsh plugin --profile desktop add link:/path/to/dsh-session-delete
```

## 璁稿彲璇?
MIT锛岃 [LICENSE](LICENSE)銆?
