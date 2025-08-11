import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="fides-loader" strategy="beforeInteractive">
          {`
            function loadFides () {
              if (document.getElementById('fides-js')) return;

              window.fides_overrides = {
                fides_consent_non_applicable_flag_mode: "include",
                fides_consent_flag_type: "boolean",
              };
              addEventListener("FidesInitializing", function () {
                window.Fides.gtm({
                  non_applicable_flag_mode: "include",
                  flag_type: "boolean",
                });
              });
              addEventListener("FidesInitialized", function () {
                var id = window.Fides?.experience?.experience_config?.id;
                if (id) document.body.classList.add(id);
              });

              var fidesPrefix = "fides_";
              var searchParams = new URLSearchParams(location.search);
              var fidesSearchParams = new URLSearchParams();
              for (var entry of searchParams.entries()) {
                var key = entry[0], value = entry[1];
                if (key.startsWith(fidesPrefix)) {
                  fidesSearchParams.set(
                    key.replace(fidesPrefix, ""),
                    key === fidesPrefix + "cache_bust" ? Date.now().toString() : value
                  );
                }
              }

              var src = "https://ethyca.fides-cdn.ethyca.com/fides.js?"
                + fidesSearchParams.toString()
                + "&property_id=FDS-KSB4MF"; // replace if needed

              var s = document.createElement("script");
              s.id = "fides-js";
              s.async = false;
              s.defer = false;
              s.src = src;
              document.head.appendChild(s);
            }

            loadFides();
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
