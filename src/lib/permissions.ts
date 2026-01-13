
import type { UserRole, AppSection, RolePermissions } from './types';

export const ALL_SECTIONS: { id: AppSection, label: string }[] = [
    { id: 'pedidos', label: 'Pedidos' },
    { id: 'criar-pedido', label: 'Criar Pedido' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'produtos', label: 'Produtos' },
    { id: 'categorias', label: 'Categorias' },
    { id: 'avarias', label: 'Avarias' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'minhas-comissoes', label: 'Minhas Comissões' },
    { id: 'auditoria', label: 'Auditoria' },
    { id: 'configuracao', label: 'Configurações' },
    { id: 'usuarios', label: 'Usuários' },
];

export const initialPermissions: RolePermissions = {
    vendedor: [
        'pedidos',
        'criar-pedido',
        'clientes',
        'produtos',
        'minhas-comissoes',
        'avarias',
    ],
    vendedor_externo: [
        'minhas-comissoes',
    ],
    gerente: [
        'pedidos',
        'criar-pedido',
        'clientes',
        'produtos',
        'categorias',
        'avarias',
        'financeiro',
        'minhas-comissoes',
        'auditoria',
        'configuracao',
    ],
    admin: [
        'pedidos',
        'criar-pedido',
        'clientes',
        'produtos',
        'categorias',
        'avarias',
        'financeiro',
        'minhas-comissoes',
        'auditoria',
        'configuracao',
        'usuarios',
    ],
};


export function hasAccess(role: UserRole, section: AppSection, permissions: RolePermissions): boolean {
    if (role === 'vendedor_externo') return section === 'minhas-comissoes';
    if (role === 'admin') return true; // Admin always has access
    if (role === 'gerente' && section === 'financeiro') return true;
    if (role === 'vendedor' && section === 'produtos') return true;
    const rolePermissions = permissions[role];
    if (!rolePermissions) {
        return false;
    }
    return rolePermissions.includes(section);
}
