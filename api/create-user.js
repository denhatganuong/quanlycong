// api/create-user.js
// Vercel Serverless Function (Node.js). Giữ SUPABASE_SERVICE_ROLE_KEY an toàn ở đây,
// không bao giờ gửi khóa này xuống trình duyệt.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password, callerToken } = req.body || {};
  if (!username || !password || !callerToken) {
    return res.status(400).json({ error: 'Thiếu thông tin (username/password/callerToken).' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu cần tối thiểu 6 ký tự.' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server thiếu cấu hình biến môi trường Supabase.' });
  }

  try {
    // 1) Xác thực người gọi: phải là 1 phiên đăng nhập hợp lệ VÀ đúng tài khoản admin
    const whoRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + callerToken },
    });
    if (!whoRes.ok) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ, hãy đăng nhập lại.' });
    }
    const who = await whoRes.json();
    const callerEmail = (who.email || '').toLowerCase();
    if (callerEmail !== 'admin@hrapp.internal') {
      return res.status(403).json({ error: 'Chỉ tài khoản admin mới được tạo tài khoản mới.' });
    }

    // 2) Tạo user mới bằng service role key (chỉ dùng ở server)
    const email = String(username).trim().toLowerCase() + '@hrapp.internal';
    const createRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email, password: password, email_confirm: true }),
    });
    const createData = await createRes.json();

    if (!createRes.ok) {
      const msg = createData && (createData.msg || createData.error_description || createData.message);
      if (msg && /already.*registered|already exists/i.test(msg)) {
        return res.status(400).json({ error: 'Tên đăng nhập này đã có tài khoản rồi.' });
      }
      return res.status(400).json({ error: msg || 'Không tạo được tài khoản.' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi máy chủ: ' + (e && e.message ? e.message : String(e)) });
  }
}
