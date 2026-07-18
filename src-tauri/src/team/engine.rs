//! Ekip motoru — `team/engine.ts` karşılığı. Sunucusuz, son-yazan-kazanır (revision).

use std::collections::HashSet;

use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::state::AppState;
use crate::sync::providers::Provider;
use crate::types::SiteExportEntry;

use super::crypto::{
    decode_invite_code, decrypt_invite, decrypt_team_payload, encode_invite_code, encrypt_invite,
    encrypt_team_payload, generate_team_key, InviteGist, InviteWebdav, TeamInvitePayload, TeamMember,
    TeamPayload, TEAM_FILE_NAME,
};
use super::store::{TeamCreds, TeamInsert};

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn site_key(s: &SiteExportEntry) -> String {
    format!("{:?} {} {} {} {}", s.protocol, s.host.to_lowercase(), s.port, s.user, s.name)
}

/// Site listelerini birleştirir (eklemeli — anahtar: protokol+host+port+kullanıcı+ad).
fn union_sites(base: Vec<SiteExportEntry>, incoming: Vec<SiteExportEntry>) -> Vec<SiteExportEntry> {
    let mut seen: HashSet<String> = base.iter().map(site_key).collect();
    let mut out = base;
    for s in incoming {
        if seen.insert(site_key(&s)) {
            out.push(s);
        }
    }
    out
}

fn upsert_member(members: &mut Vec<TeamMember>, member: TeamMember) {
    match members.iter().position(|m| m.id == member.id) {
        Some(i) => members[i] = member,
        None => members.push(member),
    }
}

fn team_provider(creds: TeamCreds) -> FerroResult<Provider> {
    Ok(match creds {
        TeamCreds::Gist { token, gist_id } => {
            if token.is_empty() {
                return Err(FerroError::new(FerroErrorCode::Validation, "Ekip depo jetonu yok"));
            }
            Provider::Gist { token, gist_id, file_name: TEAM_FILE_NAME.into() }
        }
        TeamCreds::Webdav { url, user, password } => {
            if url.is_empty() {
                return Err(FerroError::new(FerroErrorCode::Validation, "Ekip WebDAV adresi yok"));
            }
            Provider::Webdav { url, user, password, file_name: TEAM_FILE_NAME.into() }
        }
    })
}

/// Uzak kasayı çeker (yoksa None).
async fn fetch_payload(state: &AppState, team_id: &str) -> FerroResult<Option<TeamPayload>> {
    let creds = state
        .teams
        .credentials(&state.vault, team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Ekip bulunamadı"))?;
    let key = state
        .teams
        .team_key(&state.vault, team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::Validation, "Ekip anahtarı yok"))?;
    let provider = team_provider(creds)?;
    let Some(text) = provider.download().await? else {
        return Ok(None);
    };
    let blob = serde_json::from_str(&text)
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Validation, "Ekip dosyası çözümlenemedi", e.to_string()))?;
    Ok(Some(decrypt_team_payload(&blob, &key)?))
}

/// Kasayı şifreleyip yükler; yeni gistId oluştuysa saklar.
async fn upload_payload(state: &AppState, team_id: &str, payload: &TeamPayload) -> FerroResult<()> {
    let creds = state
        .teams
        .credentials(&state.vault, team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Ekip bulunamadı"))?;
    let key = state
        .teams
        .team_key(&state.vault, team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::Validation, "Ekip anahtarı yok"))?;
    let blob = encrypt_team_payload(payload, &key)?;
    let text = serde_json::to_string_pretty(&blob)?;
    let provider = team_provider(creds)?;
    if let Some(new_id) = provider.upload(&text).await? {
        state.teams.set_gist_id(team_id, &new_id);
    }
    Ok(())
}

// ── girdi tipleri ──

#[derive(Deserialize)]
struct RepoGist {
    #[serde(rename = "gistId", default)]
    gist_id: String,
    #[serde(default)]
    token: String,
}
#[derive(Deserialize)]
struct RepoWebdav {
    #[serde(default)]
    url: String,
    #[serde(default)]
    user: String,
    #[serde(default)]
    password: String,
}
#[derive(Deserialize)]
struct CreateInput {
    name: String,
    #[serde(rename = "memberName")]
    member_name: String,
    provider: String,
    #[serde(default)]
    gist: Option<RepoGist>,
    #[serde(default)]
    webdav: Option<RepoWebdav>,
}

fn build_insert(team_id: String, role: String, member_id: String, i: &CreateInput, team_key: String) -> TeamInsert {
    let g = i.gist.as_ref();
    let w = i.webdav.as_ref();
    TeamInsert {
        team_id,
        name: i.name.clone(),
        role,
        member_id,
        member_name: i.member_name.clone(),
        provider: i.provider.clone(),
        gist_id: g.map(|g| g.gist_id.clone()).unwrap_or_default(),
        token: g.map(|g| g.token.clone()).unwrap_or_default(),
        url: w.map(|w| w.url.clone()).unwrap_or_default(),
        user: w.map(|w| w.user.clone()).unwrap_or_default(),
        password: w.map(|w| w.password.clone()).unwrap_or_default(),
        team_key,
    }
}

// ── işlemler ──

pub async fn create(state: &AppState, payload: Value) -> FerroResult<Value> {
    let input: CreateInput = serde_json::from_value(payload)?;
    let team_id = Uuid::new_v4().to_string();
    let member_id = Uuid::new_v4().to_string();
    let team_key = generate_team_key();
    let now = now_iso();

    let creator = TeamMember {
        id: member_id.clone(),
        name: input.member_name.clone(),
        role: "admin".into(),
        added_at: now.clone(),
        added_by: None,
    };
    // Önce yerel: erişim bilgisi + anahtar saklanır.
    state.teams.add(&state.vault, build_insert(team_id.clone(), "admin".into(), member_id, &input, team_key));

    let payload = TeamPayload {
        kind: "ferro-team-payload".into(),
        version: 1,
        team_id: team_id.clone(),
        name: input.name.clone(),
        updated_at: now.clone(),
        revision: 1,
        members: vec![creator.clone()],
        sites: vec![],
    };
    upload_payload(state, &team_id, &payload).await?;
    state.teams.mark_synced(&team_id, vec![creator], vec![], 1, Some("admin".into()), now);

    state.teams.get_public(&team_id).map(|team| json!({ "team": team }))
        .ok_or_else(|| FerroError::new(FerroErrorCode::Unknown, "Ekip oluşturulamadı"))
}

pub async fn join(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(Deserialize)]
    struct JoinInput {
        code: String,
        pin: String,
        #[serde(rename = "memberName")]
        member_name: String,
    }
    let input: JoinInput = serde_json::from_value(payload)?;
    let file = decode_invite_code(&input.code)?;
    let invite = decrypt_invite(&file, &input.pin)?;

    // Davet yükünden yerel ekip kaydı kur (erişim + anahtar).
    let member_id = Uuid::new_v4().to_string();
    let insert = TeamInsert {
        team_id: file.team_id.clone(),
        name: file.team_name.clone(),
        role: file.role.clone(),
        member_id: member_id.clone(),
        member_name: input.member_name.clone(),
        provider: invite.provider.clone(),
        gist_id: invite.gist.as_ref().map(|g| g.gist_id.clone()).unwrap_or_default(),
        token: invite.gist.as_ref().map(|g| g.token.clone()).unwrap_or_default(),
        url: invite.webdav.as_ref().map(|w| w.url.clone()).unwrap_or_default(),
        user: invite.webdav.as_ref().map(|w| w.user.clone()).unwrap_or_default(),
        password: invite.webdav.as_ref().map(|w| w.password.clone()).unwrap_or_default(),
        team_key: invite.team_key.clone(),
    };
    state.teams.add(&state.vault, insert);

    let mut remote = fetch_payload(state, &file.team_id)
        .await?
        .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Ekip kasası bulunamadı"))?;
    if remote.team_id != file.team_id {
        state.teams.remove(&file.team_id);
        return Err(FerroError::new(FerroErrorCode::Validation, "Ekip kimliği uyuşmuyor"));
    }
    let now = now_iso();
    let me = TeamMember {
        id: member_id,
        name: input.member_name,
        role: file.role.clone(),
        added_at: now.clone(),
        added_by: Some("invite".into()),
    };
    upsert_member(&mut remote.members, me);
    remote.revision += 1;
    remote.updated_at = now.clone();
    // Yükleme best-effort — başarısız olsa da yerel kayıt uzak revision ile kalır.
    let _ = upload_payload(state, &file.team_id, &remote).await;
    state.teams.mark_synced(&file.team_id, remote.members.clone(), remote.sites.clone(), remote.revision, Some(file.role), now);

    state.teams.get_public(&file.team_id).map(|team| json!({ "team": team }))
        .ok_or_else(|| FerroError::new(FerroErrorCode::Unknown, "Ekibe katılınamadı"))
}

pub async fn pull(state: &AppState, payload: Value) -> FerroResult<Value> {
    let team_id = payload.get("teamId").and_then(Value::as_str).unwrap_or_default().to_string();
    let Some(remote) = fetch_payload(state, &team_id).await? else {
        return Ok(json!({ "found": false }));
    };
    let my_id = state.teams.member_id(&team_id);
    let my_role = my_id
        .and_then(|id| remote.members.iter().find(|m| m.id == id).map(|m| m.role.clone()));
    state.teams.mark_synced(&team_id, remote.members.clone(), remote.sites.clone(), remote.revision, my_role.clone(), now_iso());
    Ok(json!({
        "found": true,
        "revision": remote.revision,
        "memberCount": remote.members.len(),
        "siteCount": remote.sites.len(),
        "role": my_role,
    }))
}

pub async fn push(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(Deserialize)]
    struct PushInput {
        #[serde(rename = "teamId")]
        team_id: String,
        #[serde(rename = "siteIds")]
        site_ids: Vec<String>,
    }
    let input: PushInput = serde_json::from_value(payload)?;
    if state.teams.role(&input.team_id).as_deref() == Some("readonly") {
        return Err(FerroError::new(FerroErrorCode::Validation, "Salt-okunur üye siteleri paylaşamaz"));
    }
    let team_public = state
        .teams
        .get_public(&input.team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Ekip bulunamadı"))?;
    let team_name = team_public.get("name").and_then(Value::as_str).unwrap_or_default().to_string();
    let new_sites = state.sites.export_sites_by_ids(&state.vault, &input.site_ids, Some(&team_name));

    let mut remote = match fetch_payload(state, &input.team_id).await? {
        Some(r) => r,
        None => TeamPayload {
            kind: "ferro-team-payload".into(),
            version: 1,
            team_id: input.team_id.clone(),
            name: team_name.clone(),
            updated_at: now_iso(),
            revision: 0,
            members: vec![],
            sites: vec![],
        },
    };
    let base_count = remote.sites.len();
    remote.sites = union_sites(remote.sites, new_sites);
    let added = remote.sites.len() - base_count;
    remote.revision += 1;
    remote.updated_at = now_iso();
    upload_payload(state, &input.team_id, &remote).await?;
    state.teams.mark_synced(&input.team_id, remote.members.clone(), remote.sites.clone(), remote.revision, None, now_iso());

    Ok(json!({ "revision": remote.revision, "siteCount": remote.sites.len(), "added": added }))
}

pub fn invite(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(Deserialize)]
    struct InviteInput {
        #[serde(rename = "teamId")]
        team_id: String,
        role: String,
        pin: String,
    }
    let input: InviteInput = serde_json::from_value(payload)?;
    if state.teams.role(&input.team_id).as_deref() != Some("admin") {
        return Err(FerroError::new(FerroErrorCode::Validation, "Yalnızca yöneticiler davet oluşturabilir"));
    }
    if input.pin.len() < 4 {
        return Err(FerroError::new(FerroErrorCode::Validation, "PIN en az 4 karakter olmalı"));
    }
    let team_key = state
        .teams
        .team_key(&state.vault, &input.team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::Validation, "Ekip anahtarı yok"))?;
    let team_public = state
        .teams
        .get_public(&input.team_id)
        .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Ekip bulunamadı"))?;
    let team_name = team_public.get("name").and_then(Value::as_str).unwrap_or_default().to_string();

    let creds = state.teams.credentials(&state.vault, &input.team_id).unwrap();
    let (provider, gist, webdav) = match creds {
        TeamCreds::Gist { token, gist_id } => ("gist", Some(InviteGist { gist_id, token }), None),
        TeamCreds::Webdav { url, user, password } => ("webdav", None, Some(InviteWebdav { url, user, password })),
    };
    let invite_payload = TeamInvitePayload { team_key, provider: provider.into(), gist, webdav };
    let file = encrypt_invite(&invite_payload, &input.pin, &input.team_id, &team_name, &input.role)?;
    Ok(json!({ "code": encode_invite_code(&file)? }))
}

pub fn members(state: &AppState, payload: Value) -> FerroResult<Value> {
    let team_id = payload.get("teamId").and_then(Value::as_str).unwrap_or_default();
    Ok(json!({ "members": state.teams.cached_members(team_id) }))
}

pub fn leave(state: &AppState, payload: Value) -> FerroResult<Value> {
    let team_id = payload.get("teamId").and_then(Value::as_str).unwrap_or_default();
    state.teams.remove(team_id);
    Ok(json!({ "ok": true }))
}

pub fn import_sites(state: &AppState, payload: Value) -> FerroResult<Value> {
    let team_id = payload.get("teamId").and_then(Value::as_str).unwrap_or_default();
    let sites = state.teams.cached_sites(team_id);
    let total = sites.len();
    let (imported, skipped) = state.sites.import_sites(&state.vault, sites);
    Ok(json!({ "imported": imported, "skipped": skipped, "total": total }))
}

/// Admin roster mutasyonu (rol değiştir / üye çıkar). Uzak kasayı çeker, değiştirir, yükler.
async fn mutate_roster(
    state: &AppState,
    team_id: &str,
    mutate: impl FnOnce(&mut Vec<TeamMember>, &str) -> FerroResult<()>,
) -> FerroResult<Value> {
    if state.teams.role(team_id).as_deref() != Some("admin") {
        return Err(FerroError::new(FerroErrorCode::Validation, "Yalnızca yöneticiler roster'ı değiştirebilir"));
    }
    let my_id = state.teams.member_id(team_id).unwrap_or_default();
    let mut remote = fetch_payload(state, team_id)
        .await?
        .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Ekip kasası bulunamadı"))?;
    mutate(&mut remote.members, &my_id)?;
    remote.revision += 1;
    remote.updated_at = now_iso();
    upload_payload(state, team_id, &remote).await?;
    state.teams.mark_synced(team_id, remote.members.clone(), remote.sites.clone(), remote.revision, None, now_iso());
    Ok(json!({ "members": remote.members }))
}

pub async fn set_role(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(Deserialize)]
    struct Input {
        #[serde(rename = "teamId")]
        team_id: String,
        #[serde(rename = "memberId")]
        member_id: String,
        role: String,
    }
    let input: Input = serde_json::from_value(payload)?;
    let mid = input.member_id.clone();
    let role = input.role.clone();
    mutate_roster(state, &input.team_id, move |members, _me| {
        let m = members.iter_mut().find(|m| m.id == mid)
            .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, "Üye bulunamadı"))?;
        m.role = role;
        Ok(())
    })
    .await
}

pub async fn remove_member(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(Deserialize)]
    struct Input {
        #[serde(rename = "teamId")]
        team_id: String,
        #[serde(rename = "memberId")]
        member_id: String,
    }
    let input: Input = serde_json::from_value(payload)?;
    let mid = input.member_id.clone();
    mutate_roster(state, &input.team_id, move |members, me| {
        if mid == me {
            return Err(FerroError::new(FerroErrorCode::Validation, "Kendinizi çıkaramazsınız"));
        }
        members.retain(|m| m.id != mid);
        Ok(())
    })
    .await
}

pub fn list(state: &AppState) -> FerroResult<Value> {
    Ok(json!({
        "teams": state.teams.list_public(),
        "encryptionAvailable": state.vault.encryption_available(),
    }))
}
