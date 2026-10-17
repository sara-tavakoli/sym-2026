# Auth testing (VisitReady)
- Email/password: POST /api/auth/signup {email,password} → sets httpOnly `session_token` cookie (also accepted as `Authorization: Bearer <token>`).
- POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me, PUT /api/auth/profile.
- Google (Emergent-managed): frontend → https://auth.emergentagent.com/?redirect=<origin + current path>; returns with #session_id → POST /api/auth/google/session {session_id}.
- Test session via mongosh: insert users {user_id, email, name, created_at} + user_sessions {user_id, session_token, expires_at(+7d), created_at}; then use cookie/Bearer.
- Patient-owned visits: persona=<user_id>; any other caller → 404.
