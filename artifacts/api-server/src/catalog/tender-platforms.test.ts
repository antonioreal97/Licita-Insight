import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REGISTRATION_OPTIONS,
  isRegistrationSlug,
  platformFromPublication,
  platformKind,
  platformUrl,
} from "./tender-platforms";

const byName = (usuarioNome: string, extra: Record<string, unknown> = {}) =>
  platformFromPublication({ usuarioNome, ...extra });

describe("tender platform normalization", () => {
  it("recognizes the bidding rooms by the PNCP publisher name seen in production", () => {
    const cases: [string, string][] = [
      ["Compras.gov.br", "comprasgov"],
      ["Licitanet Licitações Eletrônicas LTDA", "licitanet"],
      ["BLL Compras", "bll"],
      ["Bolsa Nacional De Compras - BNC", "bnc"],
      ["ECustomize Consultoria em Software S.A", "portal-compras-publicas"],
      ["Licitações-E BB", "licitacoes-e"],
      ["Licitar Digital - Plataforma de Licitações Online", "licitar-digital"],
      ["Novo BBMNET Licitações", "bbmnet"],
      ["Licita + Brasil", "licita-mais-brasil"],
      ["Contrata+Brasil", "contrata-mais-brasil"],
      ["Portal de Compras do Estado de Minas Gerais", "compras-mg"],
      ["Portal de Compras Públicas do Estado do Rio de Janeiro", "compras-rj"],
    ];
    for (const [name, slug] of cases) {
      assert.equal(byName(name).slug, slug, name);
      assert.equal(platformKind(slug), "platform", slug);
    }
    assert.deepEqual(byName("Licitanet Licitações Eletrônicas LTDA"), {
      slug: "licitanet",
      label: "Licitanet",
    });
  });

  it("finds the real room through the origin link when the publisher is a management system", () => {
    assert.deepEqual(
      byName("AZ INFORMATICA LTDA", {
        linkSistemaOrigem: "https://comprasbr.com.br/pregao-eletronico/12345",
      }),
      { slug: "comprasbr", label: "ComprasBR" },
    );
    assert.equal(
      byName("Fiorilli Software", {
        linkSistemaOrigem: "https://www.licitanet.com.br/sessao/99",
      }).slug,
      "licitanet",
    );
    assert.equal(
      byName("PROCERGS - CENTRO DE TECNOLOGIA DA INFORMACAO E COMUNICACAO DO ESTADO DO RIO GRANDE DO SUL S.A.", {
        linkProcessoEletronico: "www.compras.rs.gov.br/egov2/indexPublic.jsp",
      }).slug,
      "compras-rs",
    );
    assert.equal(
      byName("Grupo Assessor", { linkSistemaOrigem: "https://licitacoes-e2.bb.com.br/aop-inter-estatico/" }).slug,
      "licitacoes-e",
    );
  });

  it("does not treat a state system on a lookalike host as the federal room", () => {
    const platform = byName("Secretaria de Estado da Administração de Sergipe", {
      linkSistemaOrigem: "https://sistema.comprasnet.se.gov.br/processos",
    });
    assert.equal(platform.slug, "outro-secretaria-de-estado-da-administracao-de-sergipe");
    assert.equal(platformKind(platform.slug), "other");
  });

  it("labels management software as the source system, never as the bidding room", () => {
    const platform = byName("IPM Sistemas", {
      linkSistemaOrigem: "https://jaragua.atende.net/transparencia",
      linkProcessoEletronico: "pregaoeletronico@jaragua.sc.gov.br",
    });
    assert.deepEqual(platform, {
      slug: "origem-ipm-sistemas",
      label: "Sistema de origem: IPM Sistemas",
    });
    assert.equal(platformKind(platform.slug), "source_system");
    assert.equal(platformUrl(platform.slug), null);
    assert.equal(byName("Betha Sistemas").slug, "origem-betha-sistemas");
    assert.equal(byName("E & L PRODUCOES DE SOFTWARE LTDA").slug, "origem-e-l-producoes-de-software-ltda");
    assert.equal(byName("Equiplano Sistemas LTDA / Equiplano Sistemas ").label, "Sistema de origem: Equiplano Sistemas LTDA / Equiplano Sistemas");
  });

  it("keeps every other publisher as 'Outro sistema' with its own name", () => {
    assert.deepEqual(byName("Governançabrasil Tecnologia e Gestão em Serviços"), {
      slug: "outro-governancabrasil-tecnologia-e-gestao-em-servicos",
      label: "Outro sistema: Governançabrasil Tecnologia e Gestão em Serviços",
    });
    assert.equal(byName("Canal de Compras Brasil").slug, "outro-canal-de-compras-brasil");
    assert.ok(byName("A".repeat(200)).slug.length <= "outro-".length + 60);
  });

  it("marks a missing publisher instead of guessing", () => {
    assert.deepEqual(platformFromPublication({}), {
      slug: "nao-informado",
      label: "Sistema não informado",
    });
    assert.equal(platformFromPublication({ usuarioNome: "  " }).slug, "nao-informado");
    assert.equal(platformKind("nao-informado"), "unknown");
  });

  it("offers every room plus SICAF as a registration option", () => {
    assert.ok(REGISTRATION_OPTIONS.some((option) => option.slug === "sicaf"));
    assert.ok(isRegistrationSlug("licitanet"));
    assert.ok(isRegistrationSlug("sicaf"));
    assert.equal(isRegistrationSlug("origem-ipm-sistemas"), false);
    assert.equal(isRegistrationSlug(42), false);
  });
});
