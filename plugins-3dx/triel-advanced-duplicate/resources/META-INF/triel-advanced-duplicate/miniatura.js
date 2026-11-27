/*
 * Triel-HT - plugin advanced-duplicate: miniatura do item ao passar o mouse no Titulo, na janela de Duplicacao
 * avancada. Entregue pelo AdvancedDuplicateFilter (sem cache) so com o plugin em Ativo; __CFG__ e trocado pela
 * configuracao do Portal. Tudo dentro de try/catch: qualquer falha esconde o balao e a janela segue como a da Dassault.
 * Falhas vao (no maximo 3 por janela) para /webapps/TrielAdvancedDuplicate/evento e aparecem nos eventos do Portal.
 */
(function (cfg) {
    "use strict";
    var w = window, d = document;
    if (w.__trielAdvDupThumb) return;
    w.__trielAdvDupThumb = cfg.versao;

    var reported = 0;
    function report(msg) {
        try {
            if (reported++ >= 3) return;
            var u = require.toUrl("DS/TrielAdvancedDuplicate/evento");
            new Image().src = u + (u.indexOf("?") < 0 ? "?" : "&") + "v=" + encodeURIComponent(cfg.versao)
                + "&m=" + encodeURIComponent(String(msg).slice(0, 300));
        } catch (e) { /* sem registro: segue */ }
    }

    var spaceUrl = null, waf = null, pop = null, img = null, cap = null, cur = null, timer = null, last = null;
    var cache = {}, failures = 0;

    function hide() {
        try {
            cur = null;
            if (timer) { clearTimeout(timer); timer = null; }
            if (pop) pop.style.display = "none";
        } catch (e) { /* nada */ }
    }

    function safe(fn) {
        return function () {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                hide();
                report("erro: " + ((e && e.message) || e));
            }
        };
    }

    function place(ev) {
        if (!pop || !ev) return;
        var x = ev.clientX + 18, y = ev.clientY + 14, pw = pop.offsetWidth, ph = pop.offsetHeight;
        if (x + pw > w.innerWidth - 8) x = Math.max(8, ev.clientX - 18 - pw);
        if (y + ph > w.innerHeight - 8) y = Math.max(8, ev.clientY - 14 - ph);
        pop.style.left = x + "px";
        pop.style.top = y + "px";
    }

    function build() {
        if (pop) return;
        pop = d.createElement("div");
        pop.setAttribute("data-triel", "advanced-duplicate-miniatura");
        pop.style.cssText = "position:fixed;z-index:2147483000;display:none;pointer-events:none;background:#fff;"
            + "border:1px solid #c8c8c8;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.25);padding:6px;"
            + "font:12px Arial,Helvetica,sans-serif;color:#3d3d3d;text-align:center;max-width:" + (cfg.largura + 14) + "px";
        img = d.createElement("img");
        img.style.cssText = "display:block;margin:0 auto 4px;max-width:" + cfg.largura + "px;max-height:"
            + Math.round(cfg.largura * 0.75) + "px";
        cap = d.createElement("div");
        cap.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        pop.appendChild(img);
        pop.appendChild(cap);
        (d.body || d.documentElement).appendChild(pop);
    }

    /** URL da imagem (servico da propria Dassault, o mesmo do Comparador); null = sem miniatura. */
    function thumb(pid) {
        if (!cache[pid]) {
            cache[pid] = new Promise(function (ok) {
                waf.authenticatedRequest(spaceUrl + "/resources/compare/thumbnailUrl/" + encodeURIComponent(pid), {
                    method: "GET",
                    type: "text",
                    timeout: cfg.timeoutMs,
                    onComplete: function (r) {
                        r = String(r || "").trim();
                        if (r && !/^https?:\/\//.test(r)) r = /^\//.test(r) ? spaceUrl + r : null;
                        ok(r || null);
                    },
                    onFailure: function (e) {
                        delete cache[pid];
                        if (failures++ === 0) report("servico de miniatura falhou: " + ((e && e.message) || e));
                        ok(null);
                    },
                    onTimeout: function () {
                        delete cache[pid];
                        if (failures++ === 0) report("servico de miniatura sem resposta em " + cfg.timeoutMs + " ms");
                        ok(null);
                    }
                });
            });
        }
        return cache[pid];
    }

    function show(pid, label) {
        thumb(pid).then(safe(function (url) {
            if (cur !== pid || !url) {
                if (cur === pid) hide();
                return;
            }
            build();
            img.onload = safe(function () {
                if (cur !== pid) return;
                pop.style.display = "block";
                place(last);
            });
            img.onerror = function () { if (cur === pid) hide(); };
            cap.textContent = label || "";
            img.src = url;
        }));
    }

    /** Grade da janela de duplicacao (WUX DataGridView); outras grades da pagina nao sao tocadas. */
    function grid(el) {
        var g = el && el.closest && el.closest(".assemblyTreeListContainer .wux-layouts-datagridview");
        return g && g.dsModel && g.getAttribute("wux-identifier") === "duplicate" ? g : null;
    }

    function install() {
        d.addEventListener("mouseover", safe(function (ev) {
            var g = grid(ev.target);
            if (!g) {
                if (cur) hide();
                return;
            }
            var ci = g.dsModel.getCellInfosFromHtmlElement(ev.target);
            var o = ci && ci.columnID === 0 && ci.nodeModel && ci.nodeModel.options;
            var pid = o && o.physicalId;
            if (!pid) {
                hide();
                return;
            }
            if (pid === cur) return;
            hide();
            cur = pid;
            last = ev;
            timer = setTimeout(safe(function () { timer = null; show(pid, o.label); }), cfg.atrasoMs);
        }), true);
        d.addEventListener("mousemove", function (ev) {
            last = ev;
            if (pop && pop.style.display === "block") place(ev);
        }, true);
        ["mousedown", "wheel", "keydown"].forEach(function (t) { d.addEventListener(t, hide, true); });
        d.addEventListener("scroll", hide, true);
    }

    function fallbackSpaceUrl() {
        var b = w.dsDefaultWebappsBaseUrl;
        if (typeof b === "string" && b.indexOf("/api/widget/proxy") < 0) {
            var i = b.indexOf("/webapps/");
            if (i > 0) return b.slice(0, i);
        }
        return null;
    }

    try {
        require(["DS/WAFData/WAFData", "DS/i3DXCompassServices/i3DXCompassServices"], safe(function (W, C) {
            waf = W;
            var platform = null;
            try { platform = w.widget && w.widget.getValue && w.widget.getValue("x3dPlatformId"); } catch (e) { /* sem widget */ }
            var done = false;
            function start(u) {
                if (done) return;
                done = true;
                spaceUrl = u ? String(u).replace(/\/+$/, "") : fallbackSpaceUrl();
                if (spaceUrl) install();
                else report("endereco do 3DSpace nao encontrado");
            }
            C.getServiceUrl({
                serviceName: "3DSpace",
                platformId: platform,
                onComplete: safe(function (u) {
                    if (typeof u === "string") return start(u);
                    if (u && u.length) {
                        for (var i = 0; i < u.length; i++) if (u[i] && u[i].platformId === platform) return start(u[i].url);
                        return start(u[0] && u[0].url);
                    }
                    start(null);
                }),
                onFailure: function () { start(null); }
            });
            setTimeout(function () { start(null); }, 15000);
        }), function (e) { report("modulos do 3DX: " + ((e && e.message) || e)); });
    } catch (e) {
        report("inicio: " + ((e && e.message) || e));
    }
})(__CFG__);
