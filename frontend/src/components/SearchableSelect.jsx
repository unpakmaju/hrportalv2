import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Cari...',
  renderOption,
  renderSelected,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on outside click and reset search query
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autofocus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const selectedOption = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return options.find((opt) => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return String(opt) === String(value);
      }
      return opt && String(opt.value) === String(value);
    });
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;

    const queryWords = q.split(/\s+/).filter(Boolean);

    return options.filter((opt) => {
      if (opt === null || opt === undefined) return false;

      let searchableText = '';
      if (typeof opt === 'string' || typeof opt === 'number') {
        searchableText = String(opt);
      } else {
        const fields = [
          opt.label,
          opt.name,
          opt.nama,
          opt.nama_prodi,
          opt.nama_unit,
          opt.nama_fakultas,
          opt.value,
          opt.desc,
          opt.subtitle,
          opt.nip,
          opt.kode,
          opt.kode_unit,
          opt.kode_fakultas,
          opt.kode_prodi,
          opt.jabatan,
        ];
        searchableText = fields.filter(Boolean).map(String).join(' ');
      }

      const lowerText = searchableText.toLowerCase();
      return queryWords.every((word) => lowerText.includes(word));
    });
  }, [options, searchQuery]);

  const handleToggle = () => {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
      setSearchQuery('');
    } else {
      setIsOpen(true);
      setSearchQuery('');
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Field */}
      <div
        onClick={handleToggle}
        className="bm-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f3f4f6' : '#ffffff',
          borderColor: isOpen ? '#10b981' : '#e2e8f0',
          boxShadow: isOpen ? '0 0 0 3px rgba(16, 185, 129, 0.15)' : 'none',
          padding: '10px 14px',
          minHeight: '42px',
          borderRadius: '10px',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? (
            renderSelected ? (
              renderSelected(selectedOption)
            ) : (
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {typeof selectedOption === 'object'
                  ? selectedOption.label || selectedOption.name || selectedOption.nama || selectedOption.value
                  : String(selectedOption)}
              </span>
            )
          ) : (
            <span style={{ color: '#94a3b8' }}>{placeholder}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
          {selectedOption && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setSearchQuery('');
              }}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              title="Hapus pilihan"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} style={{ transition: 'transform 0.2s ease', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
        </div>
      </div>

      {/* Searchable Dropdown Popup */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease forwards',
          }}
        >
          {/* Search Box Input */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              ref={inputRef}
              type="text"
              className="bm-input"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                paddingLeft: '36px',
                height: '36px',
                fontSize: '0.85rem',
                borderRadius: '8px',
                background: '#f8fafc',
              }}
            />
          </div>

          {/* Options List */}
          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
            {/* Opsi Reset / Semua */}
            {(!searchQuery.trim() || 'semua'.includes(searchQuery.trim().toLowerCase())) && (
              <div
                onClick={() => {
                  onChange(null);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: !value ? '#f0fdf4' : 'transparent',
                  color: !value ? '#15803d' : '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s ease',
                  marginBottom: '2px',
                  borderBottom: '1px dashed #e2e8f0',
                }}
                onMouseEnter={(e) => {
                  if (value) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (value) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{placeholder}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tampilkan semua pilihan</div>
                </div>
                {!value && <Check size={16} color="#10b981" />}
              </div>
            )}

            {filteredOptions.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.825rem' }}>
                Tidak ada opsi ditemukan.
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const optValue = typeof opt === 'object' && opt !== null ? opt.value : opt;
                const optLabel = typeof opt === 'object' && opt !== null ? (opt.label || opt.name || opt.nama || opt.value) : String(opt);
                const optSubtitle = typeof opt === 'object' && opt !== null ? opt.subtitle : null;
                const isSelected = String(optValue) === String(value);

                return (
                  <div
                    key={`${optValue ?? optLabel ?? idx}-${idx}`}
                    onClick={() => {
                      onChange(optValue, opt);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSelected ? '#f0fdf4' : 'transparent',
                      color: isSelected ? '#15803d' : '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.15s ease',
                      marginBottom: '2px',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {renderOption ? (
                        renderOption(opt)
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{optLabel}</div>
                          {optSubtitle && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{optSubtitle}</div>}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check size={16} color="#10b981" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
