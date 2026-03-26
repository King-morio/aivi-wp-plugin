<?php
/**
 * REST API Document Metadata Controller
 *
 * @package AiVI
 */

namespace AiVI;

defined('ABSPATH') || exit;

class REST_Document_Meta extends \WP_REST_Controller
{
    const META_DESCRIPTION_KEY = '_aivi_meta_description';
    const CANONICAL_URL_KEY = '_aivi_canonical_url';
    const LANG_KEY = '_aivi_lang';

    public function __construct()
    {
        $this->namespace = 'aivi/v1';
        $this->rest_base = 'document-meta';

        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public static function read_document_meta($post_id)
    {
        $post_id = absint($post_id);
        if ($post_id <= 0) {
            return array(
                'post_id' => 0,
                'title' => '',
                'meta_description' => '',
                'canonical_url' => '',
                'lang' => ''
            );
        }

        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) {
            return array(
                'post_id' => $post_id,
                'title' => '',
                'meta_description' => '',
                'canonical_url' => '',
                'lang' => ''
            );
        }

        return array(
            'post_id' => $post_id,
            'title' => (string) get_the_title($post),
            'meta_description' => (string) get_post_meta($post_id, self::META_DESCRIPTION_KEY, true),
            'canonical_url' => (string) get_post_meta($post_id, self::CANONICAL_URL_KEY, true),
            'lang' => (string) get_post_meta($post_id, self::LANG_KEY, true)
        );
    }

    public function register_routes()
    {
        register_rest_route(
            $this->namespace,
            '/' . $this->rest_base . '/(?P<post_id>\d+)',
            array(
                array(
                    'methods' => \WP_REST_Server::READABLE,
                    'callback' => array($this, 'get_document_meta'),
                    'permission_callback' => array($this, 'check_permissions'),
                    'args' => array(
                        'post_id' => array(
                            'type' => 'integer',
                            'required' => true,
                            'sanitize_callback' => 'absint',
                        ),
                    ),
                ),
                array(
                    'methods' => \WP_REST_Server::EDITABLE,
                    'callback' => array($this, 'update_document_meta'),
                    'permission_callback' => array($this, 'check_permissions'),
                    'args' => array(
                        'post_id' => array(
                            'type' => 'integer',
                            'required' => true,
                            'sanitize_callback' => 'absint',
                        ),
                        'title' => array(
                            'type' => 'string',
                            'required' => false,
                            'sanitize_callback' => array($this, 'sanitize_title_field'),
                        ),
                        'meta_description' => array(
                            'type' => 'string',
                            'required' => false,
                            'sanitize_callback' => 'sanitize_textarea_field',
                        ),
                        'canonical_url' => array(
                            'type' => 'string',
                            'required' => false,
                            'sanitize_callback' => 'esc_url_raw',
                        ),
                        'lang' => array(
                            'type' => 'string',
                            'required' => false,
                            'sanitize_callback' => array($this, 'sanitize_lang_field'),
                        ),
                    ),
                ),
            )
        );
    }

    public function check_permissions($request)
    {
        $post_id = absint($request->get_param('post_id'));
        if ($post_id <= 0 || !current_user_can('edit_post', $post_id)) {
            return new \WP_Error(
                'rest_forbidden',
				__('Sorry, you cannot edit this document metadata.', 'ai-visibility-inspector'),
                array('status' => rest_authorization_required_code())
            );
        }
        return true;
    }

    public function get_document_meta($request)
    {
        $post_id = absint($request->get_param('post_id'));
        return rest_ensure_response(
            array(
                'ok' => true,
                'document_meta' => self::read_document_meta($post_id),
            )
        );
    }

    public function update_document_meta($request)
    {
        $post_id = absint($request->get_param('post_id'));
        $post = get_post($post_id);
        if (!$post instanceof \WP_Post) {
            return new \WP_Error(
                'aivi_document_meta_not_found',
				__('Document not found.', 'ai-visibility-inspector'),
                array('status' => 404)
            );
        }

        if ($request->offsetExists('title')) {
            $title = $this->sanitize_title_field($request->get_param('title'));
            if ($title !== '' && $title !== $post->post_title) {
                wp_update_post(
                    array(
                        'ID' => $post_id,
                        'post_title' => $title,
                    )
                );
            }
        }

        $this->write_meta_value($post_id, self::META_DESCRIPTION_KEY, $request, 'meta_description');
        $this->write_meta_value($post_id, self::CANONICAL_URL_KEY, $request, 'canonical_url');
        $this->write_meta_value($post_id, self::LANG_KEY, $request, 'lang');

        return rest_ensure_response(
            array(
                'ok' => true,
                'document_meta' => self::read_document_meta($post_id),
            )
        );
    }

    private function write_meta_value($post_id, $meta_key, $request, $param_key)
    {
        if (!$request->offsetExists($param_key)) {
            return;
        }
        $value = $request->get_param($param_key);
        $value = is_string($value) ? trim($value) : '';
        if ($value === '') {
            delete_post_meta($post_id, $meta_key);
            return;
        }
        update_post_meta($post_id, $meta_key, $value);
    }

    public function sanitize_title_field($value)
    {
        return sanitize_text_field(wp_strip_all_tags((string) $value));
    }

    public function sanitize_lang_field($value)
    {
        $lang = strtolower(trim((string) $value));
        $lang = preg_replace('/[^a-z0-9_-]/', '', $lang);
        return is_string($lang) ? substr($lang, 0, 20) : '';
    }
}
