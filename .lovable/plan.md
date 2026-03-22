

## Piano: Scambio automatico del code OAuth

Quando mi invierai il `code` dalla barra indirizzi, io:

1. **Eseguo lo scambio** — Lancio il comando `curl` / script nel sandbox per scambiare il code con Spotify (`POST https://accounts.spotify.com/api/token` con `grant_type=authorization_code`)
2. **Ti scrivo il refresh token in chat** — Ti mostro il valore completo del `refresh_token` così puoi copiarlo
3. **Aggiorno il secret** — Ti chiedo di approvare l'aggiornamento del secret con il valore corretto

### Cosa devi fare tu

1. Apri questo link nel browser:
```
https://accounts.spotify.com/authorize?client_id=TUO_CLIENT_ID&response_type=code&redirect_uri=https://soundflowrd.lovable.app/callback&scope=user-read-private%20user-read-email%20streaming
```
2. Autorizza l'app
3. Copia il valore dopo `?code=` dalla barra indirizzi
4. **Incollalo qui in chat**

Io faccio tutto il resto e ti mostro il refresh token in chiaro.

