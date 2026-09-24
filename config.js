// Daily Ref 설정 파일
// 여기 값들은 공개돼도 괜찮은 값이에요. (데이터는 Supabase의 RLS 규칙이 지켜요)
// 절대 secret / service_role 키를 이 파일에 넣지 마세요.
window.DAILY_REF_CONFIG = {
  supabaseUrl: "https://lbwklpfvqkmbbiyuyhhv.supabase.co",
  supabaseKey: "sb_publishable_nanbVoLSv5JTbAOYj6MASg_nDc-fVxe",

  // Google 로그인 설정(Google Cloud + Supabase)을 마친 뒤 true 로 바꾸세요.
  googleLogin: false,
};
