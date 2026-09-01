(() => {
    let uvPfx = "/core/";
    // check if config is loaded in context of service worker or not
    let loc = self.location.pathname.includes(uvPfx)
        ? self.location.pathname.substring(
              0,
              self.location.pathname.indexOf(uvPfx),
          )
        : self.location.pathname.substring(
              0,
              self.location.pathname.lastIndexOf("/"),
          );

    self.__uv$config = {
        prefix: "/core/service/",
        encodeUrl: Ultraviolet.codec.xor.encode,
        decodeUrl: Ultraviolet.codec.xor.decode,
        handler: loc + uvPfx + "handler.js",
        client: loc + uvPfx + "client.js",
        bundle: loc + uvPfx + "bundle.js",
        config: loc + uvPfx + "config.js",
        sw: loc + uvPfx + "sw-handler.js",
        stockSW: loc + uvPfx + "sw.js",
        loc: loc,
    };
})();
