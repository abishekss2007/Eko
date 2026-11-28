/** The violet night sky behind the public pages: deep indigo, two soft glows and a few stars. */
export function NightSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-iris-dusk to-iris-night">
      <div className="stars absolute inset-0" />
      <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] max-w-[100vw] rounded-full bg-[#7b5fe0] opacity-40 blur-[120px]" />
      <div className="absolute -right-32 top-24 h-[28rem] w-[28rem] max-w-[100vw] rounded-full bg-[#c427fb] opacity-20 blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#40cbd8] opacity-10 blur-[100px]" />
    </div>
  );
}

/** The SaansSafe app mark, as on the home screen. */
export const LOGO_MARK = "grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-iris-light to-iris text-snow shadow-md shadow-black/30";
